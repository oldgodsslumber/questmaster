/* Questmaster — all tuning lives here.
 *
 * Nothing in this file is load-bearing for correctness; it is the dial board.
 * The rulebook (DCC_TTRPG_Core_Rulebook.md) fixes some of these — those are
 * marked BOOK. Everything else is habit-tracker adaptation and is fair game.
 */
window.CONFIG = {

  build: '20260727o',

  /* ---- Attributes ------------------------------------------------------ */

  /* BOOK: creation distributes exactly this array across the five stats. */
  attributeArray: [2, 3, 4, 5, 6],
  attributeKeys: ['STR', 'DEX', 'CON', 'INT', 'CHA'],
  attributeNames: {
    STR: 'Strength',
    DEX: 'Dexterity',
    CON: 'Constitution',
    INT: 'Intelligence',
    CHA: 'Charisma'
  },
  attributeBlurbs: {
    STR: 'Heavy weapon damage and athletic actions.',
    DEX: 'Reaction speed and base defenses.',
    CON: 'The structural value of your health slots.',
    INT: 'Magical aptitude. Your max Mana equals this raw score.',
    CHA: 'Social manipulation and sway over the viewing audience.'
  },

  /* The book gives a "CON +2" example but never prints the table. Halving the
   * score reproduces that example and stays monotonic, so we use it. */
  scoreToModifier: function (score) { return Math.floor(score / 2); },

  /* Hard ceiling on a single attribute, to keep point spending sane. */
  attributeMax: 20,

  /* ---- Derived stats (BOOK) -------------------------------------------- */

  healthSlots: 10,                       // BOOK: 10 slots, always
  /* BOOK: each slot's capacity is the CON modifier, so max HP = 10 x CON mod. */
  slotCapacity: function (conMod) { return Math.max(1, conMod); },
  /* BOOK: max Mana is the RAW Intelligence score, not the modifier. */
  maxMana: function (intScore) { return Math.max(0, intScore); },
  /* BOOK: 10 + DEX mod + dungeon floor level. */
  passiveEvade: function (dexMod, floorLevel) { return 10 + dexMod + floorLevel; },

  defaultSize: 4,                        // BOOK: human crawlers are Size 4
  startingAiFavor: 1,                    // BOOK: humans start with 1
  defaultFloorLevel: 1,

  /* ---- Character XP & leveling ----------------------------------------- */

  /* Deliberate divergence from the book, which levels on milestones. This is
   * the habit-tracker adaptation: tasks pay XP, XP pays levels.
   *
   * Tuning target is roughly one level per week. A daily quest with four tasks
   * pays 4*10 + 30 = 70/day = ~490/week, which lands near the early curve. */
  xpPerTaskDefault: 10,
  questBonusXpDefault: 30,
  xpForLevel: function (level) { return Math.round(400 * Math.pow(level, 1.12)); },
  attributePointsPerLevel: 2,
  levelMax: 99,

  /* ---- Skills ----------------------------------------------------------- */

  /* BOOK: Rank caps at 20 (a Minor-tier trait is what raises a cap TO 20, so
   * 20 is the ceiling of the scale). Ranks here advance on XP rather than the
   * book's end-of-session d20 checkmark roll — same reason as leveling. */
  skillRankMax: 20,
  skillXpForRank: function (rank) { return 40 + (rank * 25); },
  skillTrainingXpDefault: 5,

  /* A task may instead train an attribute directly. Attributes have no XP bar
   * on the sheet (they grow from level-up points), so training accumulates in a
   * hidden pool and pays out a permanent +1 when it fills. Deliberately slow —
   * this is a side channel, not a replacement for leveling. */
  attributeTrainingThreshold: 150,

  /* ---- Quests ----------------------------------------------------------- */

  cadences: ['daily', 'weekly', 'monthly', 'oneoff'],
  cadenceLabels: {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    oneoff: 'One-time'
  },
  /* Streak milestones that write an auto-event to the Chronicle. */
  streakMilestones: [3, 7, 14, 30, 60, 100, 365],

  /* Co-op bonus split. Unused until M5 (party layer) but the number lives here
   * so the split is a config change, not a code change. 1.0 = winner takes all. */
  coopBonusTopShare: 0.7,

  /* ---- Races & Classes point-buy ---------------------------------------- */

  /* The book names the five tiers and the detriment rule but never prints the
   * costs, so these are ours. */
  pointTiers: ['Minor', 'Moderate', 'Major', 'Extreme', 'Epic'],
  tierCosts: { Minor: 1, Moderate: 2, Major: 3, Extreme: 4, Epic: 5 },
  tierColors: {
    Minor: '#7d8ca3',
    Moderate: '#4f9d69',
    Major: '#3f7fc1',
    Extreme: '#9b59b6',
    Epic: '#d4a027'
  },
  buildPointBudget: 10,
  /* BOOK: Earth classes grant roughly 50% more customization points. */
  earthClassBudgetMultiplier: 1.5,
  /* BOOK: up to 5 points of detriments, yielding at a two-for-one deficit. */
  detrimentPointCap: 5,
  detrimentDeficit: 2,
  /* BOOK gates the whole subsystem behind Dungeon Floor 3. Ungated by default —
   * set this to 3 to honour the book. */
  buildUnlockFloor: 0,

  /* ---- Icons ------------------------------------------------------------ */

  /* game-icons.net has no REST API. We resolve slugs against the source repo
   * on jsDelivr and inline the returned SVG markup — html2canvas taints on
   * cross-origin <img>, so PNG export requires real inline <svg> nodes. */
  iconCdn: 'https://cdn.jsdelivr.net/gh/game-icons/icons@master/',
  iconCacheKey: 'qm.iconcache.v1',
  iconCacheLimit: 400,

  /* ---- Loot: rarities & boxes ------------------------------------------ */

  /* Item rarity ladder — colour and sort order. */
  rarities: {
    common:    { label: 'Common',    color: '#9aa4b2', order: 0 },
    uncommon:  { label: 'Uncommon',  color: '#4f9d69', order: 1 },
    rare:      { label: 'Rare',      color: '#3f7fc1', order: 2 },
    epic:      { label: 'Epic',      color: '#9b59b6', order: 3 },
    legendary: { label: 'Legendary', color: '#d4a027', order: 4 }
  },

  /* Loot box tiers, straight from the DCC ladder (Bronze → Celestial). Each
   * tier rolls `rolls[0]..rolls[1]` items, with the rarity odds in `weights`
   * (relative weights, need not sum to 100). Higher tiers shift the odds up. */
  lootBoxes: {
    order: ['bronze', 'silver', 'gold', 'platinum', 'legendary', 'celestial'],
    tiers: {
      bronze:    { label: 'Bronze Box',    color: '#a97142', icon: 'delapouite/locked-chest', rolls: [1, 1], weights: { common: 76, uncommon: 21, rare: 3, epic: 0, legendary: 0 } },
      silver:    { label: 'Silver Box',    color: '#c3ccd6', icon: 'delapouite/locked-chest', rolls: [1, 2], weights: { common: 55, uncommon: 33, rare: 10, epic: 2, legendary: 0 } },
      gold:      { label: 'Gold Box',      color: '#d4a027', icon: 'delapouite/locked-chest', rolls: [2, 2], weights: { common: 34, uncommon: 38, rare: 21, epic: 6, legendary: 1 } },
      platinum:  { label: 'Platinum Box',  color: '#7fd0e0', icon: 'delapouite/locked-chest', rolls: [2, 3], weights: { common: 14, uncommon: 34, rare: 33, epic: 16, legendary: 3 } },
      legendary: { label: 'Legendary Box', color: '#b46fd0', icon: 'delapouite/locked-chest', rolls: [3, 3], weights: { common: 4, uncommon: 20, rare: 36, epic: 30, legendary: 10 } },
      celestial: { label: 'Celestial Box', color: '#f0c04a', icon: 'delapouite/locked-chest', rolls: [3, 4], weights: { common: 0, uncommon: 10, rare: 30, epic: 40, legendary: 20 } }
    }
  },

  /* ---- Misc ------------------------------------------------------------- */

  defaultLogbookName: 'Chronicle',
  toastMs: 2600
};
