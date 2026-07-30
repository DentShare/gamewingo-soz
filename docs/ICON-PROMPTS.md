# Промты для генерации иконок игр

Набор иконок каталога держится на одном условии: **общий блок стиля неизменен**, меняется
только композиция. Ниже — общий блок и одиннадцать композиций, по одной на игру.
Полный промт = блок стиля + строка `Composition` нужной игры.

Требования к готовому файлу — в `docs/ICONS.md`.

## Общий блок стиля (не менять между иконками)

```
Create a high-quality 3D icon in a modern mobile game UI style.

Style:
- glossy soft plastic material
- rounded smooth shapes, no sharp edges
- minimalistic composition
- teal (#4E9B90), orange (#F76624) and white color palette
- soft studio lighting, ambient occlusion, subtle contact shadow
- slightly angled isometric perspective, camera from the upper right
- transparent background
- one centered object filling about 85% of a square frame, even margins on all sides
- readable at 82×82 px: few large shapes, no fine detail

Composition:
<КОМПОЗИЦИЯ ИГРЫ ИЗ ТАБЛИЦЫ НИЖЕ>

Use simple geometric elements (tiles, blocks, counters, shapes, sliders, stacks) to visually
communicate the gameplay.

Make it look like a premium hyper-casual game icon.
Avoid text unless it's a number or simple symbol.

Highly polished, modern, App Store quality, 3D render, Octane/Blender style.

3D icon, glossy plastic, soft rounded geometry, minimal UI, teal and orange color scheme,
white base, clean composition, floating elements, isometric angle, soft shadows, ambient
occlusion, high-end mobile game asset, hyper casual style, smooth reflections, no noise,
no realism, toy-like aesthetic
```

Негативный промт (там, где он поддерживается):

```
text, letters, words, watermark, logo, photorealism, human hands, busy background,
gradient background, multiple separate objects, clutter, cropped edges, harsh shadows,
noise, grain
```

## Композиции по играм

| slug | Игра | Composition |
|---|---|---|
| `sorting` | Сортировка | a white plastic sorting tray divided into four shallow compartments, each holding four identical pieces: orange discs, teal triangles, teal squares, orange squares, with a thick orange arrow pointing down into the tray |
| `counting` | Счёт | a white plastic card with a big embossed orange numeral 3, and three glossy teal counting beads standing in a row beside it |
| `stack` | Башня | a tower of four rounded plastic slabs stacked slightly off-centre, alternating orange and teal, with the topmost slab floating just above the stack |
| `flyer` | Полёт | two thick rounded orange pillars with a wide gap between them and a small teal capsule-shaped flyer passing through the gap, leaving a soft motion arc |
| `targets` | Меткий глаз | a tilted round plastic target disc with concentric orange and white rings, a teal dart stuck just off-centre, and a thin ripple ring around the hit |
| `snake` | Змейка | a chunky teal snake made of rounded cubes bending in an L shape on a small white base, with a glossy orange sphere in front of its head |
| `soz` | 5 букв | three chunky rounded plastic letter tiles in a row on a white base — two teal, one orange, blank faces — with a fourth tile flipping in mid-air above the row |
| `pairs` | Найди пару | two rounded plastic cards on a white base, one face-down with an orange back, one face-up showing a simple teal circle, and a third card floating above mid-flip |
| `fifteen` | Пятнашки | a white plastic tray with four chunky rounded number tiles embossed 1, 2, 3 in teal and orange, one slot left empty and one tile sliding into it |
| `2048` | 2048 | three rounded plastic tiles of growing size embossed 2, 4 and 8, the small orange and teal ones on a white base and the large orange one floating above them, merging |
| `sudoku-kids` | Мини-судоку | a white plastic board with a 2×2 grid of shallow slots, an orange tile embossed 1 and a teal tile embossed 2 placed in it, and one blank tile floating above an empty slot |

## Как удержать единый стиль набора

1. **Генерировать все одиннадцать в одной сессии**, не растягивая на дни: модели дрейфуют
   между версиями.
2. **Опорное изображение.** Первая готовая иконка (`sorting`) становится референсом стиля для
   остальных: в Midjourney — `--sref <ссылка на файл>`, в GPT Image / Nano Banana — приложить
   картинку и добавить `same style, same materials, same camera angle as the reference`.
3. **Фиксировать seed**, если инструмент это умеет, — и менять только композицию.
4. **Отбор по паре**: сравнивать кандидата не с промтом, а с уже принятыми иконками —
   отличаться должны только предметы, а не угол камеры, свет и насыщенность материала.
5. **Проверка на 82 px.** Уменьшить кандидата до 82×82 и посмотреть: если предмет не
   опознаётся — композиция слишком мелкая, упрощать до 2–3 крупных форм.

## После генерации

- квадрат 1:1, 512 px и больше;
- фон вырезать до прозрачности (генераторы почти всегда отдают белый);
- имя файла — slug из таблицы (`sorting.png`, `counting.png`, …);
- дальше по `docs/ICONS.md`: ужимаем до 246×246 WebP, кладём в `hub/icons/`, вписываем slug
  в `RASTER_ICONS`;
- строка в `docs/LICENSES.md`: AI-генерация, каким инструментом, дата — условия
  использования у генераторов различаются и должны быть зафиксированы.
