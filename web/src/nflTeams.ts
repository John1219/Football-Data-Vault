export interface TeamMeta {
  abbr: string;
  name: string;
  color: string;
  altColor: string;
  logoUrl: string;
}

const ESPN_SLUG_MAP: Record<string, string> = {
  WAS: 'wsh',
  LA: 'lar',
};

function makeTeam(abbr: string, name: string, color: string, altColor: string): TeamMeta {
  const slug = (ESPN_SLUG_MAP[abbr] ?? abbr).toLowerCase();
  return {
    abbr,
    name,
    color,
    altColor,
    logoUrl: `https://a.espncdn.com/i/teamlogos/nfl/500/${slug}.png`,
  };
}

export const NFL_TEAMS: Record<string, TeamMeta> = {
  ARI: makeTeam('ARI', 'Cardinals', '#97233F', '#FFB612'),
  ATL: makeTeam('ATL', 'Falcons', '#A71930', '#000000'),
  BAL: makeTeam('BAL', 'Ravens', '#241773', '#9E7C0C'),
  BUF: makeTeam('BUF', 'Bills', '#00338D', '#C60C30'),
  CAR: makeTeam('CAR', 'Panthers', '#0085CA', '#101820'),
  CHI: makeTeam('CHI', 'Bears', '#0B162A', '#C83803'),
  CIN: makeTeam('CIN', 'Bengals', '#FB4F14', '#000000'),
  CLE: makeTeam('CLE', 'Browns', '#FF3C00', '#311D00'),
  DAL: makeTeam('DAL', 'Cowboys', '#003594', '#869397'),
  DEN: makeTeam('DEN', 'Broncos', '#FB4F14', '#002244'),
  DET: makeTeam('DET', 'Lions', '#0076B6', '#B0B7BC'),
  GB: makeTeam('GB', 'Packers', '#203731', '#FFB612'),
  HOU: makeTeam('HOU', 'Texans', '#03202F', '#A71930'),
  IND: makeTeam('IND', 'Colts', '#002C5F', '#A2AAAD'),
  JAX: makeTeam('JAX', 'Jaguars', '#006778', '#D7A22A'),
  KC: makeTeam('KC', 'Chiefs', '#E31837', '#FFB81C'),
  LA: makeTeam('LA', 'Rams', '#003594', '#FFA300'),
  LAC: makeTeam('LAC', 'Chargers', '#0080C6', '#FFC20E'),
  LV: makeTeam('LV', 'Raiders', '#000000', '#A5ACAF'),
  MIA: makeTeam('MIA', 'Dolphins', '#008E97', '#FC4C02'),
  MIN: makeTeam('MIN', 'Vikings', '#4F2683', '#FFC62F'),
  NE: makeTeam('NE', 'Patriots', '#002244', '#C60C30'),
  NO: makeTeam('NO', 'Saints', '#D3BC8D', '#101820'),
  NYG: makeTeam('NYG', 'Giants', '#0B2265', '#A71930'),
  NYJ: makeTeam('NYJ', 'Jets', '#125740', '#FFFFFF'),
  PHI: makeTeam('PHI', 'Eagles', '#004C54', '#A5ACAF'),
  PIT: makeTeam('PIT', 'Steelers', '#FFB612', '#101820'),
  SEA: makeTeam('SEA', 'Seahawks', '#002244', '#69BE28'),
  SF: makeTeam('SF', '49ers', '#AA0000', '#B3995D'),
  TB: makeTeam('TB', 'Buccaneers', '#D50A0A', '#34302B'),
  TEN: makeTeam('TEN', 'Titans', '#0C2340', '#4B92DB'),
  WAS: makeTeam('WAS', 'Commanders', '#5A1414', '#FFB612'),
};

export function getTeamMeta(abbr: string | null | undefined): TeamMeta {
  if (!abbr) return makeTeam('NFL', 'NFL', '#38bdf8', '#94a3b8');
  const key = abbr.toUpperCase();
  return NFL_TEAMS[key] ?? makeTeam(key, key, '#38bdf8', '#94a3b8');
}
