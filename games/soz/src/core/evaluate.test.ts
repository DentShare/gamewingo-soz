import { describe, it, expect } from 'vitest';
import { evaluateGuess } from './evaluate';

describe('evaluateGuess (по юнитам)', () => {
  it('всё на месте', () => {
    expect(evaluateGuess(['к', 'н', 'и', 'г', 'а'], ['к', 'н', 'и', 'г', 'а']))
      .toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
  });
  it('всё мимо', () => {
    expect(evaluateGuess(['б', 'о', 'м', 'ж', 'ы'], ['к', 'н', 'и', 'г', 'а']))
      .toEqual(['absent', 'absent', 'absent', 'absent', 'absent']);
  });
  it('дубль в догадке при одном вхождении в ответе → только одна зелёная', () => {
    expect(evaluateGuess(['а', 'а', 'б', 'в', 'г'], ['а', 'с', 'к', 'е', 'т']))
      .toEqual(['correct', 'absent', 'absent', 'absent', 'absent']);
  });
  it('present считается из оставшегося пула после correct', () => {
    expect(evaluateGuess(['б', 'о', 'к', 'а', 'л'], ['к', 'о', 'л', 'б', 'а']))
      .toEqual(['present', 'correct', 'present', 'present', 'present']);
  });
  it('работает на диграф-юнитах uz', () => {
    expect(evaluateGuess(['h', 'a', 'sh', 'a', 'r'], ['sh', 'a', 'h', 'a', 'r']))
      .toEqual(['present', 'correct', 'present', 'correct', 'correct']);
  });
});
