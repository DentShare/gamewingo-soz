"""Independent cron worker: verified full archives in a private S3 bucket."""
import base64
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
import time
import zipfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4

PREFIX = "history/v1/"
LATEST = PREFIX + "latest.json"
MAX_BYTES = 1024 * 1024 * 1024


def configured():
    return all(os.getenv(name) for name in (
        "BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"))


def storage():
    import boto3
    from botocore.config import Config
    if not configured():
        raise RuntimeError("Backup storage is not configured")
    return boto3.client("s3", endpoint_url=os.environ["BACKUP_S3_ENDPOINT"],
                        region_name=os.getenv("BACKUP_S3_REGION", "auto"),
                        aws_access_key_id=os.environ["BACKUP_S3_ACCESS_KEY_ID"],
                        aws_secret_access_key=os.environ["BACKUP_S3_SECRET_ACCESS_KEY"],
                        config=Config(connect_timeout=10, read_timeout=120,
                                      retries={"max_attempts": 4, "mode": "standard"},
                                      s3={"addressing_style": os.getenv("BACKUP_S3_URL_STYLE", "virtual")}))


def copy_stream(source, target):
    size = 0
    digest = hashlib.sha256()
    while chunk := source.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_BYTES:
            raise ValueError("Archive exceeds backup size limit")
        digest.update(chunk)
        target.write(chunk)
    return size, digest.hexdigest()


def verify_archive(path):
    with zipfile.ZipFile(path) as package:
        if package.getinfo("manifest.json").file_size > 65536:
            raise ValueError("Invalid manifest size")
        manifest = json.loads(package.read("manifest.json"))
        version = manifest.get("version")
        expected = {"monitor.sqlite3", "manifest.json", "README.txt", "users.csv",
                    "sessions.csv", "coins.csv", "played_rounds.csv"}
        if version == 2:
            expected.add("funnel_sessions.csv")
        if set(package.namelist()) != expected or len(package.infolist()) != len(expected):
            raise ValueError("Unexpected archive contents")
        if sum(item.file_size for item in package.infolist()) > MAX_BYTES * 2:
            raise ValueError("Unpacked archive exceeds size limit")
        if package.testzip() is not None:
            raise ValueError("Corrupted archive")
        if (manifest.get("format") != "gamewingo-pilot-history" or version not in (1, 2)
                or manifest.get("scope") != "all-stored-history"):
            raise ValueError("Unsupported history format")
        with tempfile.TemporaryDirectory(prefix="wingo-restore-check-") as folder:
            restored = Path(folder) / "monitor.sqlite3"
            with package.open("monitor.sqlite3") as source, restored.open("wb") as target:
                copy_stream(source, target)
            with closing(sqlite3.connect(f"{restored.as_uri()}?mode=ro", uri=True)) as db:
                if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("SQLite integrity check failed")
                tables = ["sessions", "coins", "played_rounds"]
                if version == 2:
                    tables.append("funnel_sessions")
                counts = {table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}
                counts["users"] = db.execute("""SELECT COUNT(*) FROM (
                    SELECT user_id FROM sessions UNION SELECT user_id FROM coins
                    UNION SELECT user_id FROM played_rounds)""").fetchone()[0]
                if counts != manifest.get("rows"):
                    raise ValueError("Snapshot row counts do not match manifest")
    return manifest


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def download_source(path):
    base = os.environ["MONITOR_BACKUP_URL"].rstrip("/")
    parsed = urlsplit(base)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
        raise ValueError("Backup source must be an HTTPS URL without credentials")
    token = os.environ["MONITOR_TOKEN"]
    if not token:
        raise ValueError("Backup report credential missing")
    auth = base64.b64encode(f"report:{token}".encode()).decode()
    request = Request(base + "/monitor/archive.zip", headers={"Authorization": "Basic " + auth})
    with build_opener(NoRedirect).open(request, timeout=180) as response, path.open("wb") as target:
        return copy_stream(response, target)


def run_backup():
    client = storage()
    bucket = os.environ["BACKUP_S3_BUCKET"]
    with tempfile.TemporaryDirectory(prefix="wingo-backup-") as folder:
        path = Path(folder) / "history.zip"
        for attempt in range(3):
            try:
                size, digest = download_source(path)
                break
            except (URLError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))
        manifest = verify_archive(path)
        created = datetime.now(timezone.utc)
        key = PREFIX + created.strftime("%Y/%m/%d/%Y%m%dT%H%M%SZ-") + str(uuid4()) + ".zip"
        client.upload_file(str(path), bucket, key, ExtraArgs={
            "ContentType": "application/zip", "Metadata": {"sha256": digest}})
        # Read the actual stored object back; ETags alone do not verify multipart uploads.
        stored = client.get_object(Bucket=bucket, Key=key)
        with closing(stored["Body"]) as source, path.open("wb") as target:
            saved_size, saved_digest = copy_stream(source, target)
        if (saved_size, saved_digest) != (size, digest):
            raise ValueError("Stored backup checksum mismatch")
        verify_archive(path)
        metadata = {"version": 1, "objectKey": key, "sha256": digest, "bytes": size,
                    "exportedAt": manifest["exportedAt"], "rows": manifest["rows"],
                    "verifiedAt": datetime.now(timezone.utc).isoformat()}
        # Advance the pointer only after both upload and restore checks succeeded.
        client.put_object(Bucket=bucket, Key=LATEST,
                          Body=json.dumps(metadata).encode(), ContentType="application/json")
        return metadata


def latest():
    client = storage()
    result = client.get_object(Bucket=os.environ["BACKUP_S3_BUCKET"], Key=LATEST)
    with closing(result["Body"]) as body:
        metadata = json.loads(body.read(65537))
    key = metadata["objectKey"]
    if not key.startswith(PREFIX) or not key.endswith(".zip") or ".." in key:
        raise ValueError("Invalid backup key")
    verified = datetime.fromisoformat(metadata["verifiedAt"])
    age = (datetime.now(timezone.utc) - verified).total_seconds()
    return {**metadata, "configured": True, "healthy": 0 <= age <= 8 * 3600,
            "ageSeconds": max(0, int(age)), "intervalHours": 6}


def download_latest():
    metadata = latest()
    folder = Path(tempfile.mkdtemp(prefix="wingo-backup-download-"))
    try:
        path = folder / "history.zip"
        result = storage().get_object(Bucket=os.environ["BACKUP_S3_BUCKET"], Key=metadata["objectKey"])
        with closing(result["Body"]) as source, path.open("wb") as target:
            size, digest = copy_stream(source, target)
        if (size, digest) != (metadata["bytes"], metadata["sha256"]):
            raise ValueError("Backup checksum mismatch")
        verify_archive(path)
        return path
    except Exception:
        shutil.rmtree(folder)
        raise


if __name__ == "__main__":
    try:
        result = run_backup()
        print(json.dumps({"backup": "verified", **result}), flush=True)
    except Exception as error:
        # Never log secrets, source URLs or anonymous player records.
        print(json.dumps({"backup": "failed", "errorType": type(error).__name__}), flush=True)
        raise SystemExit(1)
