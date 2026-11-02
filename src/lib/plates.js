// Normalise a plate for comparison: no spaces/dashes, upper-case.
export function normPlate(p) {
  return String(p || '')
    .replace(/[\s\-_.·,]/g, '')
    .toUpperCase();
}

export const REGIONS =
  '서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주';

// Letters that can appear on Korean plates (private, rental, commercial, military...)
export const VALID_LETTERS =
  '가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주하허호바사아자배육해공국합';

const FIX = { O: '0', o: '0', I: '1', l: '1', '|': '1', S: '5', B: '8', Z: '2' };
export const fixDigits = (s) => s.replace(/[OoIl|SBZ]/g, (c) => FIX[c] || c);

// Finds the first Korean plate in text. Tolerates spaces inside and common OCR digit mistakes.
const PLATE_SRC = `(?:(${REGIONS})\\s?)?([0-9OoIl|]{2,3})\\s*([가-힣])\\s*([0-9OoIl|SBZ]{4})`;

export function findPlate(text) {
  const re = new RegExp(PLATE_SRC, 'g');
  let m;
  while ((m = re.exec(text))) {
    const tail = m[4];
    const realDigits = (tail.match(/[0-9]/g) || []).length;
    if (realDigits < 2) continue;
    const front = m[2];
    if ((front.match(/[0-9]/g) || []).length < 1) continue;
    const plate = `${m[1] || ''}${fixDigits(front)}${m[3]}${fixDigits(tail)}`;
    return {
      plate,
      start: m.index,
      end: m.index + m[0].length,
      validLetter: VALID_LETTERS.includes(m[3]),
      fixed: /[OoIl|SBZ]/.test(front + tail),
    };
  }
  return null;
}

export const isPlateLike = (s) => !!findPlate(String(s || ''));
