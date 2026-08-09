// Username screening. Files starting with "_" are not routed.
//
// Usernames are normalised before matching so leetspeak and padding don't slip
// through: "N1GG3R", "n_i_g_g_e_r" and "niiiggger" all collapse to the same
// thing. Two forms are compared — one with repeats intact, one with runs
// squeezed to a single character — so both "nigger" and "niiigger" are caught.

const LEET = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
  "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "l",
};

function normalise(raw) {
  let s = String(raw).toLowerCase();
  s = s.replace(/[0134578@$!|]/g, (c) => LEET[c] || c);
  return s.replace(/[^a-z]/g, "");          // digits, underscores, spacing all go
}

const squeeze = (s) => s.replace(/(.)\1+/g, "$1");

// The squeezed comparison only makes sense for terms that stay distinctive
// after collapsing. "kkk" squeezes to "k", which would flag every username
// containing the letter k, so short results are skipped.
const MIN_SQUEEZED = 4;

// Slurs and harassment. Matched as substrings, so compounds like "pokenigger"
// and "indianigger" are covered without listing every variation.
const BLOCKED = [
  // racial / ethnic / homophobic slurs
  "nigger", "nigga", "niger", "negro", "chink", "kike", "gook", "wetback",
  "faggot", "tranny", "shemale", "retard",
  // targeted at nationality
  "dirtyindian", "dirtymuslim", "dirtyjew", "dirtypaki",
  // violence and self-harm
  "kys", "killyou", "killu", "killyourself", "youneedtodie", "wanttodie",
  "illkill", "illskin", "illripyou", "rape", "rapist", "molest", "pedo",
  // hate movements
  "hitler", "nazi", "kkk",
  // stated intent to abuse the site
  "imstealing", "youdonotdeserve",
  // general profanity
  "fuck", "shit", "bitch", "cunt", "whore", "slut", "asshole", "dickhead",
];

// The site's own name. Reserved in every form so nobody can pose as the account
// that runs the vault — "pokestrikergay" and "pokestrikernigga" were both
// impersonation as much as abuse.
const BRAND = ["pokestriker", "pokestrikers"];

// Returns null if the name is fine, or a reason string if it should be refused.
export function screenUsername(username) {
  const flat = normalise(username);
  const tight = squeeze(flat);

  if (!flat) return "unreadable";

  const hit = (term) => {
    if (flat.includes(term)) return true;
    const sq = squeeze(term);
    return sq.length >= MIN_SQUEEZED && tight.includes(sq);
  };

  for (const term of BLOCKED) if (hit(term)) return "blocked";
  for (const term of BRAND) if (hit(term)) return "brand";
  return null;
}
