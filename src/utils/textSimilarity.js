/**
 * textSimilarity.js
 * 
 * Provides a simple and fast text similarity algorithm (Sørensen–Dice coefficient with bigrams)
 * to compare episode texts and detect duplicates or supplements.
 */

function getBigrams(str) {
  const bigrams = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  // Normalize: remove whitespace and punctuation for better comparison
  const s1 = str1.replace(/[\s\p{P}]/gu, '');
  const s2 = str2.replace(/[\s\p{P}]/gu, '');

  if (s1.length < 2 || s2.length < 2) {
    return s1 === s2 ? 1 : 0;
  }

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  let intersectionSize = 0;
  for (const bg of bg1) {
    if (bg2.has(bg)) {
      intersectionSize++;
    }
  }

  return (2.0 * intersectionSize) / (bg1.size + bg2.size);
}
