// AI の編成選択（初期実装：用意したパターンからランダムに選ぶだけ）
export function pickRandomRoster(aiRosters) {
  const pattern = aiRosters[Math.floor(Math.random() * aiRosters.length)];
  return pattern.roster;
}
