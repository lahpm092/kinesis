// Design tokens mirrored for canvas / three.js use.
export const T = {
  paper:   '#F2EAD9',
  paper2:  '#EAE0CA',
  paper3:  '#E2D6BB',
  ink:     '#29231A',
  ink2:    '#5C523F',
  ink3:    '#8A7D63',
  hair:    '#D5C8AC',
  hair2:   '#C4B492',
  sienna:  '#A34A24',
  sienna2: '#C25E32',
  gold:    '#8C6D2F',
  coal:    '#14100A',
  coal2:   '#1D1710',
  coal3:   '#2A2117',
  coalHair:'#3A2F1F',
  bone:    '#EFE4CB',
  bone2:   '#B3A382',
  amber:   '#FFB454',
  amber2:  '#E89B3E',
  teamA:   '#EFE6D2',
  teamAInk:'#8A7D63',
  teamB:   '#7C8B96',
  teamBInk:'#4E5A63',
  serif: '"Iowan Old Style", "Palatino", "Book Antiqua", Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};

export const teamColor = (team, onDark = false) =>
  team === 'A' ? (onDark ? T.teamA : T.teamAInk)
: team === 'B' ? (onDark ? T.teamB : T.teamBInk)
: (onDark ? T.bone2 : T.ink3);
