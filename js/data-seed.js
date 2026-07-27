/* Questmaster — creation-time content, sourced from the DCC core rulebook.
 *
 * The engine never reads this file; only character creation does. Edit freely —
 * adding a background or a hinge needs no code change.
 */
window.SEED = (function () {

  /* ---- Backgrounds (BOOK, Ch.2 steps 1-2) --------------------------------
   * Four chronological life stages, two skills each, at the ranks the book
   * fixes: Childhood 1, Youth 1, Career 3, Hobby 2. */

  var stages = [
    { key: 'childhood', label: 'Childhood', rank: 1, blurb: 'Where you came from, before you had a say in it.' },
    { key: 'youth', label: 'Adolescence', rank: 1, blurb: 'Who you were becoming when nobody was watching.' },
    { key: 'career', label: 'Career', rank: 3, blurb: 'What Earth paid you to be good at.' },
    { key: 'hobby', label: 'Hobby', rank: 2, blurb: 'What you did on your own time, for no reason but love.' }
  ];

  var backgrounds = {
    childhood: [
      { name: 'Latchkey Kid', skills: ['Streetwise', 'Improvisation'] },
      { name: 'Farm Raised', skills: ['Animal Handling', 'Endurance'] },
      { name: 'Military Brat', skills: ['Discipline', 'Navigation'] },
      { name: 'Only Child', skills: ['Focus', 'Deception'] },
      { name: 'Foster System', skills: ['Perception', 'Deception'] },
      { name: 'Church Basement', skills: ['Persuasion', 'Performance'] },
      { name: 'Suburban Cul-de-sac', skills: ['Athletics', 'Bartering'] },
      { name: 'Apartment Block', skills: ['Streetwise', 'Stealth'] }
    ],
    youth: [
      { name: 'Varsity Athlete', skills: ['Athletics', 'Teamwork'] },
      { name: 'Garage Band', skills: ['Performance', 'Repair'] },
      { name: 'Debate Club', skills: ['Persuasion', 'Research'] },
      { name: 'Petty Delinquent', skills: ['Stealth', 'Lockpicking'] },
      { name: 'Retail Job', skills: ['Bartering', 'Patience'] },
      { name: 'Chronically Online', skills: ['Research', 'Computers'] },
      { name: 'Scout Troop', skills: ['Survival', 'First Aid'] },
      { name: 'Skate Park', skills: ['Acrobatics', 'Pain Tolerance'] }
    ],
    career: [
      { name: 'Nurse', skills: ['First Aid', 'Composure'] },
      { name: 'Electrician', skills: ['Repair', 'Engineering'] },
      { name: 'Line Cook', skills: ['Cooking', 'Endurance'] },
      { name: 'Long-Haul Driver', skills: ['Navigation', 'Vehicles'] },
      { name: 'Software Developer', skills: ['Computers', 'Logic'] },
      { name: 'Bartender', skills: ['Persuasion', 'Perception'] },
      { name: 'Contractor', skills: ['Construction', 'Athletics'] },
      { name: 'Teacher', skills: ['Instruction', 'Composure'] },
      { name: 'Paramedic', skills: ['First Aid', 'Composure'] },
      { name: 'Soldier', skills: ['Firearms', 'Tactics'] },
      { name: 'Accountant', skills: ['Logic', 'Patience'] },
      { name: 'Landscaper', skills: ['Endurance', 'Survival'] }
    ],
    hobby: [
      { name: 'Tabletop Gamer', skills: ['Tactics', 'Improvisation'] },
      { name: 'Rock Climber', skills: ['Climbing', 'Nerve'] },
      { name: 'Home Brewer', skills: ['Alchemy', 'Patience'] },
      { name: 'Amateur Boxer', skills: ['Unarmed Combat', 'Pain Tolerance'] },
      { name: 'Birdwatcher', skills: ['Perception', 'Stealth'] },
      { name: 'Woodworker', skills: ['Crafting', 'Focus'] },
      { name: 'Distance Runner', skills: ['Endurance', 'Discipline'] },
      { name: 'True Crime Podcaster', skills: ['Research', 'Investigation'] },
      { name: 'Gardener', skills: ['Herbalism', 'Patience'] },
      { name: 'Cosplayer', skills: ['Crafting', 'Performance'] }
    ]
  };

  /* BOOK: one specialised weapon skill at Rank 3, on top of Unarmed Combat. */
  var weaponSkills = [
    'Warhammer', 'Longsword', 'Axes', 'Spears', 'Knives', 'Bows',
    'Crossbows', 'Firearms', 'Blunt Improvised', 'Whips', 'Staves', 'Slings'
  ];

  /* ---- Hinges (BOOK, Ch.2 steps 5-6) --------------------------------------
   * Three psychological flaws the System is happy to exploit on camera. */

  var hinges = {
    pastTrauma: [
      'Abused by someone I trusted',
      'Watched a parent waste away',
      'Survived something nobody else did',
      'Was blamed for a death that was not mine',
      'Grew up hungry and never stopped counting',
      'Nearly drowned and still hear the water',
      'Was left behind on purpose',
      'Broke and was never quite put back together'
    ],
    looseEnd: [
      'Never sent an important letter to a loved one',
      'Left a friendship on a bad word',
      'Owe a debt to someone who never asked for it',
      'Never told them what actually happened that night',
      'Walked out mid-argument and never went back',
      'Promised to visit and kept not going',
      'A pet at home nobody knows to feed',
      'A confession recorded but never sent'
    ],
    regret: [
      'Trusted the wrong people',
      'Chose the safe job over the real one',
      'Was cruel when I could have been kind',
      'Let fear make a decision that mattered',
      'Kept a secret that should have been told',
      'Stayed too long',
      'Left too early',
      'Was the reason someone stopped trying'
    ]
  };

  /* ---- Starter gear packages (BOOK, Ch.2 step 6) --------------------------
   * Earth clothes and junk, plus an improvised weapon matching the chosen
   * weapon skill. Deliberately useless — that is the joke. */

  var gearPacks = [
    {
      name: 'Gaming Geek Pack',
      items: ['Hooded sweatshirt', 'Jeans', 'A paperback fantasy novel', 'Novelty googly eyes'],
      icon: 'delapouite/rolling-dices'
    },
    {
      name: 'Gym Rat Pack',
      items: ['Compression shirt', 'Athletic shorts', 'A shaker bottle, half full', 'Wireless earbuds'],
      icon: 'delapouite/weight-lifting-up'
    },
    {
      name: 'Office Drone Pack',
      items: ['Wrinkled button-down', 'Slacks', 'Company lanyard', 'A cold coffee in a travel mug'],
      icon: 'delapouite/tie'
    },
    {
      name: 'Night Shift Pack',
      items: ['Work fleece', 'Steel-toed boots', 'A flashlight with weak batteries', 'Half a sandwich'],
      icon: 'delapouite/flashlight'
    },
    {
      name: 'Just Woke Up Pack',
      items: ['Sleep shirt', 'Pajama pants', 'One sock', 'A phone at 4% battery'],
      icon: 'delapouite/bed'
    },
    {
      name: 'Trail Day Pack',
      items: ['Rain shell', 'Hiking trousers', 'A water bottle', 'Trail mix, mostly raisins now'],
      icon: 'delapouite/hiking'
    }
  ];

  /* ---- Starter kit (BOOK, Ch.2) ------------------------------------------
   * Every crawler gets these, no choice involved. */

  var starterSpells = [
    {
      name: 'Heal', iconSlug: 'zeromancer/heart-plus', rank: 1, manaCost: 2,
      effect: 'heal', effectValue: 2,
      description: 'Restores 2 full Health Slots. The System does not explain how. It just happens, and it hurts a little.'
    }
  ];

  var starterSkills = [
    { name: 'Unarmed Combat', iconSlug: 'lorc/fist', rank: 3, xp: 0, description: 'Human crawlers arrive knowing how to throw a punch. Badly, but knowing.' }
  ];

  /* Icons for background-granted skills, so a freshly made sheet isn't a wall
   * of blank diamonds. Anything unlisted just starts iconless. */
  var skillIcons = {
    'Acrobatics': 'delapouite/jump-across',
    'Alchemy': 'lorc/bubbling-flask',
    'Animal Handling': 'delapouite/sheep',
    'Athletics': 'lorc/muscle-up',
    'Bartering': 'delapouite/two-coins',
    'Bows': 'lorc/pocket-bow',
    'Blunt Improvised': 'delapouite/baseball-bat',
    'Climbing': 'caro-asercion/mountain-climbing',
    'Composure': 'lorc/meditation',
    'Computers': 'lord-berandas/computing',
    'Construction': 'lorc/hammer-nails',
    'Cooking': 'delapouite/hot-meal',
    'Crafting': 'lorc/needle-drill',
    'Crossbows': 'carl-olsen/crossbow',
    'Deception': 'lorc/duality-mask',
    'Discipline': 'delapouite/mighty-force',
    'Endurance': 'lorc/run',
    'Engineering': 'lorc/gears',
    'Firearms': 'john-colburn/pistol-gun',
    'First Aid': 'delapouite/medicines',
    'Focus': 'lorc/target-dummy',
    'Herbalism': 'delapouite/high-grass',
    'Improvisation': 'delapouite/rolling-dices',
    'Instruction': 'delapouite/teacher',
    'Investigation': 'lorc/magnifying-glass',
    'Knives': 'lorc/bowie-knife',
    'Lockpicking': 'delapouite/lock-picking',
    'Logic': 'lorc/brain',
    'Longsword': 'lorc/broadsword',
    'Navigation': 'lorc/compass',
    'Nerve': 'lorc/nailed-head',
    'Pain Tolerance': 'lorc/broken-bone',
    'Patience': 'lorc/hourglass',
    'Perception': 'delapouite/eye-target',
    'Performance': 'lorc/drama-masks',
    'Persuasion': 'lorc/conversation',
    'Repair': 'lorc/auto-repair',
    'Research': 'lorc/book-cover',
    'Slings': 'delapouite/slingshot',
    'Spears': 'lorc/spear-hook',
    'Staves': 'lorc/wizard-staff',
    'Stealth': 'lorc/hood',
    'Streetwise': 'delapouite/city-car',
    'Survival': 'delapouite/camping-tent',
    'Tactics': 'skoll/chess-knight',
    'Teamwork': 'delapouite/three-friends',
    'Unarmed Combat': 'lorc/fist',
    'Vehicles': 'delapouite/city-car',
    'Warhammer': 'delapouite/thor-hammer',
    'Whips': 'lorc/whip',
    'Axes': 'lorc/battle-axe'
  };

  /* ---- Equipment slots ---------------------------------------------------
   * Named slots; only equipped gear feeds the modifier engine. */

  var equipSlots = [
    { key: 'head', label: 'Head' },
    { key: 'body', label: 'Body' },
    { key: 'hands', label: 'Hands' },
    { key: 'feet', label: 'Feet' },
    { key: 'mainHand', label: 'Main Hand' },
    { key: 'offHand', label: 'Off Hand' },
    { key: 'trinket1', label: 'Trinket I' },
    { key: 'trinket2', label: 'Trinket II' }
  ];

  /* ---- Journal starters --------------------------------------------------
   * Templated openers with a fill-in blank. Editable in the composer. */

  var statusStarters = [
    'Discovered a new area: ___',
    'Cleared ___',
    'Survived an encounter with ___',
    'Looted ___',
    'Learned that ___',
    'Made an ally of ___',
    'Made an enemy of ___',
    'Struck a bargain with ___',
    'Narrowly escaped ___',
    'The System announced: ___',
    'Descended to floor ___',
    'Gained the favor of ___',
    'Was ambushed by ___',
    'Rested at ___',
    'Earned a sponsorship from ___',
    'Something went very wrong: ___'
  ];

  var eventLabels = {
    'quest-complete': 'Quest turned in',
    'level-up': 'Level gained',
    'skill-rank': 'Skill rank raised',
    'status-applied': 'Status applied',
    'status-cleared': 'Status cleared',
    'item-gained': 'Item acquired',
    'achievement': 'Achievement earned',
    'streak': 'Streak milestone',
    'spell-cast': 'Spell cast',
    'build': 'Build changed',
    'created': 'Crawler registered'
  };

  function randomOf(list) { return list[Math.floor(Math.random() * list.length)]; }

  return {
    stages: stages,
    backgrounds: backgrounds,
    weaponSkills: weaponSkills,
    hinges: hinges,
    gearPacks: gearPacks,
    starterSpells: starterSpells,
    starterSkills: starterSkills,
    skillIcons: skillIcons,
    equipSlots: equipSlots,
    statusStarters: statusStarters,
    eventLabels: eventLabels,
    randomOf: randomOf,
    slotLabel: function (key) {
      var s = equipSlots.filter(function (x) { return x.key === key; })[0];
      return s ? s.label : titleCase(key || 'none');
    }
  };
})();
