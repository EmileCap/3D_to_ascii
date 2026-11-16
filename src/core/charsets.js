const ramp = ' .,:;irsXA253hMHGS#9B&@';
const long = Array.from({ length: 70 }, (_, i) => ramp[Math.round(i * (ramp.length - 1) / 69)]).join('');
export const charsets = {
  short: ' .:-=+*#%@',
  long,
  blocks: '░▒▓█',
  braille: '⠀⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿'
};
export function getCharset(name = 'short', custom = '') {
  const value = name === 'custom' ? custom : (charsets[name] || charsets.short);
  if (!value) throw new Error('Le jeu personnalisé est vide');
  return [...value];
}
