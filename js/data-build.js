/* Questmaster — Races & Classes point-buy content (M4).
 *
 * The rulebook describes this subsystem's *economy* precisely (five tiers, up
 * to 5 detriment points at a two-for-one deficit, Earth classes worth ~50%
 * more) but only names a handful of the 30+ races and 42+ classes it claims.
 * So the economy below is the book's; the roster is ours, written to fit it.
 * Add or rebalance entries here — nothing in the engine reads names.
 *
 * A trait's `modifiers` may be empty: plenty of the book's examples (Night
 * Vision, unlimited flight) are narrative permissions, not numbers. Those still
 * cost points and still show on the sheet; they just don't move a stat.
 */
window.BUILD = (function () {

  function m(stat, value, op) { return { stat: stat, value: value, op: op || 'add' }; }

  /* ---- Races ------------------------------------------------------------- */

  var races = [
    {
      name: 'Human', iconSlug: 'delapouite/person', isEarth: true,
      blurb: 'The baseline. Nothing given, nothing taken — and the audience finds you relatable, which is worth more than it sounds.',
      traits: [
        { name: 'Adaptable', tier: 'Minor', description: 'You learn on the job. Nobody expects much, which is its own advantage.', modifiers: [] },
        { name: 'Camera Friendly', tier: 'Moderate', description: 'Viewers root for the underdog.', modifiers: [m('CHA', 1)] },
        { name: 'Stubborn Constitution', tier: 'Major', description: 'You have been through worse. Arguably.', modifiers: [m('CON', 1)] }
      ]
    },
    {
      name: 'Primal', iconSlug: 'delapouite/caveman', isEarth: true,
      blurb: 'Earth-native and proud of it — the ancestry that unlocks Earth classes, at the cost of a permanent penalty to everything.',
      /* BOOK: Primal inflicts a permanent -1 to all base stats and is the
       * canonical gateway to the Earth-gated class list. */
      grantsEarthAccess: true,
      innate: [m('STR', -1), m('DEX', -1), m('CON', -1), m('INT', -1), m('CHA', -1)],
      innateNote: 'Permanent -1 to all five attributes. Unlocks Earth classes.',
      traits: [
        { name: 'Bare Hands, Bad Ideas', tier: 'Moderate', description: 'Improvised weapons feel right in your grip.', modifiers: [m('STR', 1)] },
        { name: 'Ancestral Endurance', tier: 'Major', description: 'Your body predates comfort and remembers it.', modifiers: [m('slotCapacity', 1)] },
        { name: 'Unbroken Line', tier: 'Extreme', description: 'Something very old wakes up when you are cornered.', modifiers: [m('STR', 2)] }
      ]
    },
    {
      name: 'Tigran', iconSlug: 'delapouite/tiger-head',
      blurb: 'Feline, fast, and entirely aware of how good that looks on camera.',
      traits: [
        { name: 'Night Vision', tier: 'Minor', description: 'Darkness is an inconvenience, not an obstacle.', modifiers: [] },
        { name: 'Retractable Claws', tier: 'Moderate', description: 'Always armed, never searched.', modifiers: [m('STR', 1)] },
        { name: 'Feline Reflexes', tier: 'Major', description: 'You move before you decide to.', modifiers: [m('DEX', 1)] },
        { name: 'Always Lands', tier: 'Extreme', description: 'Falling is a formality.', modifiers: [m('evade', 2)] },
        { name: 'Nine Lives', tier: 'Epic', description: 'The first death does not take.', modifiers: [m('maxHealth', 10)] }
      ]
    },
    {
      name: 'Obsidian Butterfly', iconSlug: 'lorc/butterfly',
      blurb: 'Volcanic-glass wings and a temperament to match. Beautiful, brittle, and lethal in a stiff breeze.',
      traits: [
        { name: 'Glass Wings', tier: 'Moderate', description: 'Short controlled glides. Landings are a work in progress.', modifiers: [m('DEX', 1)] },
        { name: 'Refracted Form', tier: 'Major', description: 'Light bends around you at the wrong moments.', modifiers: [m('evade', 2)] },
        { name: 'Volcanic Core', tier: 'Extreme', description: 'You run hot. Uncomfortably hot, for everyone.', modifiers: [m('INT', 2)] },
        { name: 'Unlimited Flight', tier: 'Epic', description: 'The floor is now optional.', modifiers: [m('DEX', 2)] }
      ]
    },
    {
      name: 'Crocodilian', iconSlug: 'lorc/croc-jaws',
      blurb: 'Armored, patient, and built entirely around the moment you stop paying attention.',
      traits: [
        { name: 'Scaled Hide', tier: 'Moderate', description: 'Natural armor plating.', modifiers: [m('slotCapacity', 1)] },
        { name: 'Death Roll', tier: 'Major', description: 'What you grab, you keep.', modifiers: [m('STR', 1)] },
        { name: 'Cold Blood', tier: 'Major', description: 'Nothing rattles you, up to and including catastrophe.', modifiers: [m('CON', 1)] },
        { name: 'Ambush Predator', tier: 'Extreme', description: 'You are already where they are going.', modifiers: [m('DEX', 1), m('STR', 1)] }
      ]
    },
    {
      name: 'Dvergr', iconSlug: 'delapouite/dwarf-face',
      blurb: 'Short, dense, and geologically stubborn. Excellent at both crafting and grudges.',
      traits: [
        { name: 'Stonesense', tier: 'Minor', description: 'You know which way is down and what is behind the wall.', modifiers: [] },
        { name: 'Forge-Hardened', tier: 'Moderate', description: 'Heat and hammering are old friends.', modifiers: [m('CON', 1)] },
        { name: 'Low Center of Gravity', tier: 'Major', description: 'Nothing moves you that you have not agreed to.', modifiers: [m('STR', 1), m('size', -1)] },
        { name: 'Ancestral Craft', tier: 'Extreme', description: 'Your hands know things you were never taught.', modifiers: [m('INT', 2)] }
      ]
    },
    {
      name: 'Sylvan', iconSlug: 'cathelineau/tree-face',
      blurb: 'Bark-skinned and slow to anger, which is different from being safe to anger.',
      traits: [
        { name: 'Photosynthetic', tier: 'Minor', description: 'You need less food than the others, and they notice.', modifiers: [] },
        { name: 'Rooted Stance', tier: 'Moderate', description: 'Grounded, in every sense.', modifiers: [m('CON', 1)] },
        { name: 'Bark Skin', tier: 'Major', description: 'Living armor that regrows overnight.', modifiers: [m('slotCapacity', 1)] },
        { name: 'Old Growth', tier: 'Epic', description: 'You remember forests that no longer exist, and they remember you.', modifiers: [m('maxMana', 5), m('INT', 1)] }
      ]
    },
    {
      name: 'Gremlin', iconSlug: 'lorc/imp',
      blurb: 'Small, loud, and structurally incapable of leaving a working machine alone.',
      traits: [
        { name: 'Small Target', tier: 'Minor', description: 'Hard to hit, easy to overlook.', modifiers: [m('size', -2)] },
        { name: 'Compulsive Tinkerer', tier: 'Moderate', description: 'It was broken. Now it is differently broken, but better.', modifiers: [m('INT', 1)] },
        { name: 'Scuttle', tier: 'Major', description: 'You go through gaps that should not admit you.', modifiers: [m('DEX', 1), m('evade', 1)] },
        { name: 'Sabotage Instinct', tier: 'Extreme', description: 'Every system has a loose bolt, and you find it first.', modifiers: [m('INT', 2)] }
      ]
    },
    {
      name: 'Revenant', iconSlug: 'lorc/haunting',
      blurb: 'You died. The System filed an objection. The paperwork is ongoing.',
      traits: [
        { name: 'Does Not Breathe', tier: 'Minor', description: 'Gas, drowning and altitude are somebody else\'s problem.', modifiers: [] },
        { name: 'Cold Presence', tier: 'Moderate', description: 'People find you unsettling and cannot say why.', modifiers: [m('CHA', -1), m('INT', 2)] },
        { name: 'Grave Vigor', tier: 'Major', description: 'Wounds close wrong, but they close.', modifiers: [m('maxHealth', 6)] },
        { name: 'Second Death Deferred', tier: 'Epic', description: 'The System still has not decided you count as dead.', modifiers: [m('CON', 2), m('maxHealth', 8)] }
      ]
    },
    {
      name: 'Aetherborn', iconSlug: 'lorc/spark-spirit',
      blurb: 'More idea than body. The mana comes easy; keeping a shape does not.',
      traits: [
        { name: 'Faint Glow', tier: 'Minor', description: 'You are your own light source, whether you want to be or not.', modifiers: [] },
        { name: 'Mana Conduit', tier: 'Moderate', description: 'Ambient magic pools in you like water in a low spot.', modifiers: [m('maxMana', 4)] },
        { name: 'Partial Incorporeality', tier: 'Major', description: 'Some things pass through. You do not get to choose which.', modifiers: [m('evade', 2)] },
        { name: 'Arcane Reservoir', tier: 'Extreme', description: 'Your ceiling is not where anyone expected it.', modifiers: [m('INT', 2), m('maxMana', 4)] }
      ]
    },
    {
      name: 'Ursine', iconSlug: 'delapouite/bear-head',
      blurb: 'Enormous, warm, and genuinely nice right up until you are not.',
      traits: [
        { name: 'Thick Coat', tier: 'Minor', description: 'Cold is a rumour.', modifiers: [] },
        { name: 'Bulk', tier: 'Moderate', description: 'There is simply more of you.', modifiers: [m('size', 2), m('STR', 1)] },
        { name: 'Maul', tier: 'Major', description: 'Your unarmed strikes stop being metaphorical.', modifiers: [m('STR', 1)] },
        { name: 'Hibernation Recovery', tier: 'Extreme', description: 'A long sleep undoes a bad week.', modifiers: [m('CON', 2)] }
      ]
    },
    {
      name: 'Corvid', iconSlug: 'lorc/raven',
      blurb: 'Feathered, clever, and keeping a mental ledger of everyone who has wronged you.',
      traits: [
        { name: 'Bright Object Fixation', tier: 'Minor', description: 'You find the loot. You always find the loot.', modifiers: [] },
        { name: 'Keen Eye', tier: 'Moderate', description: 'You spot the seam, the tell, the trap.', modifiers: [m('DEX', 1)] },
        { name: 'Mimicry', tier: 'Major', description: 'You can be anyone\'s voice for about eight seconds.', modifiers: [m('CHA', 1)] },
        { name: 'Murder Tactics', tier: 'Extreme', description: 'You have never truly been outnumbered.', modifiers: [m('INT', 1), m('CHA', 1)] }
      ]
    }
  ];

  /* ---- Classes ------------------------------------------------------------
   * `isEarth` classes carry the book's ~50% budget premium and are gated behind
   * an Earth-native race. The gate is enforced in the Build view. */

  var classes = [
    {
      name: 'Santero', iconSlug: 'lorc/candle-flame', isEarth: false,
      blurb: 'You broker with things that were here first. They are not friends, but they answer.',
      traits: [
        { name: 'Offering Bowl', tier: 'Minor', description: 'A small tribute buys a small favor.', modifiers: [] },
        { name: 'Spirit Sight', tier: 'Moderate', description: 'You see who else is in the room.', modifiers: [m('INT', 1)] },
        { name: 'Bound Favor', tier: 'Major', description: 'Something owes you, and it hates that.', modifiers: [m('maxMana', 4)] },
        { name: 'Possession Channel', tier: 'Extreme', description: 'You lend out the driver\'s seat. Briefly.', modifiers: [m('INT', 2)] },
        { name: 'Pantheon Standing', tier: 'Epic', description: 'Names you have never spoken aloud know yours.', modifiers: [m('CHA', 2), m('maxMana', 6)] }
      ]
    },
    {
      name: 'Compensated Anarchist', iconSlug: 'delapouite/anarchy', isEarth: false,
      blurb: 'You break systems for a living. The dungeon is a system. The math works out.',
      traits: [
        { name: 'Read the Rules', tier: 'Minor', description: 'You have found the footnote and you are already thinking about it.', modifiers: [] },
        { name: 'Exploit Finder', tier: 'Moderate', description: 'Every ruleset leaks somewhere.', modifiers: [m('INT', 1)] },
        { name: 'Crowd Agitator', tier: 'Major', description: 'The audience enjoys watching the house lose.', modifiers: [m('CHA', 1), m('aiFavor', 1)] },
        { name: 'Structural Sabotage', tier: 'Extreme', description: 'The floor itself is a target.', modifiers: [m('INT', 2)] }
      ]
    },
    {
      name: 'Ironbound', iconSlug: 'lorc/shield-reflect', isEarth: false,
      blurb: 'You stand in the doorway. That is the whole job and you are very good at it.',
      traits: [
        { name: 'Braced', tier: 'Minor', description: 'You do not get pushed.', modifiers: [] },
        { name: 'Plated', tier: 'Moderate', description: 'Layers between you and consequence.', modifiers: [m('slotCapacity', 1)] },
        { name: 'Bulwark', tier: 'Major', description: 'What comes for the party comes through you.', modifiers: [m('CON', 1), m('maxHealth', 5)] },
        { name: 'Unmoved', tier: 'Extreme', description: 'Force stops being an argument that works on you.', modifiers: [m('CON', 2)] }
      ]
    },
    {
      name: 'Voidcaller', iconSlug: 'lorc/eclipse', isEarth: false,
      blurb: 'The gaps between floors have a temperature and you have learned to reach into them.',
      traits: [
        { name: 'Whisper Tolerance', tier: 'Minor', description: 'The voices no longer distract you. Much.', modifiers: [] },
        { name: 'Null Field', tier: 'Moderate', description: 'Magic thins out around you when you want it to.', modifiers: [m('evade', 1)] },
        { name: 'Entropy Bolt', tier: 'Major', description: 'A hole where the target was standing.', modifiers: [m('INT', 1)] },
        { name: 'Rift Step', tier: 'Extreme', description: 'You take the shortcut. It costs something small each time.', modifiers: [m('DEX', 2)] },
        { name: 'The Long Dark', tier: 'Epic', description: 'You have been out there and it did not keep you.', modifiers: [m('INT', 3)] }
      ]
    },
    {
      name: 'Beast Speaker', iconSlug: 'lorc/wolf-howl', isEarth: false,
      blurb: 'The dungeon\'s fauna are people, technically, and you are the only one treating them that way.',
      traits: [
        { name: 'Calming Presence', tier: 'Minor', description: 'Things with teeth relax slightly.', modifiers: [] },
        { name: 'Common Tongue of Beasts', tier: 'Moderate', description: 'Rough translation, but translation.', modifiers: [m('CHA', 1)] },
        { name: 'Pack Bond', tier: 'Major', description: 'Something large has decided you are its problem now.', modifiers: [m('CHA', 1), m('aiFavor', 1)] },
        { name: 'Apex Recognition', tier: 'Extreme', description: 'Predators read you as one of them.', modifiers: [m('CHA', 2)] }
      ]
    },
    {
      name: 'Bloodsinger', iconSlug: 'lorc/lyre', isEarth: false,
      blurb: 'Magic through performance. The audience is not incidental to the spell — it is the spell.',
      traits: [
        { name: 'Perfect Pitch', tier: 'Minor', description: 'You can hold a note under fire.', modifiers: [] },
        { name: 'Rally Chorus', tier: 'Moderate', description: 'People fight harder when you are singing.', modifiers: [m('CHA', 1)] },
        { name: 'Viewer Darling', tier: 'Major', description: 'The sponsors have noticed.', modifiers: [m('aiFavor', 1), m('CHA', 1)] },
        { name: 'Encore', tier: 'Extreme', description: 'The crowd will not let you die mid-set.', modifiers: [m('maxHealth', 8)] }
      ]
    },
    {
      name: 'Runewright', iconSlug: 'lorc/rune-stone', isEarth: false,
      blurb: 'Magic as engineering. Slower than casting, but it stays where you put it.',
      traits: [
        { name: 'Chalk and Patience', tier: 'Minor', description: 'Given ten minutes, you can prepare almost anything.', modifiers: [] },
        { name: 'Ward Circle', tier: 'Moderate', description: 'A place that is briefly safe.', modifiers: [m('evade', 1)] },
        { name: 'Inscribed Gear', tier: 'Major', description: 'Your equipment does more than it should.', modifiers: [m('INT', 1), m('maxMana', 3)] },
        { name: 'Standing Enchantment', tier: 'Extreme', description: 'The rune holds without you present.', modifiers: [m('INT', 2)] }
      ]
    },
    {
      name: 'Shadowmark', iconSlug: 'lorc/hood', isEarth: false,
      blurb: 'The floor is full of things worth taking and doors worth not knocking on.',
      traits: [
        { name: 'Light Step', tier: 'Minor', description: 'Floors do not report you.', modifiers: [] },
        { name: 'Sleight', tier: 'Moderate', description: 'Hands faster than attention.', modifiers: [m('DEX', 1)] },
        { name: 'Blind Spot', tier: 'Major', description: 'Eyes slide off you when you hold still.', modifiers: [m('evade', 2)] },
        { name: 'Perfect Extraction', tier: 'Extreme', description: 'In, out, and nobody files a report.', modifiers: [m('DEX', 2)] }
      ]
    },

    /* --- Earth-gated (BOOK: ~50% more points, heavy prerequisites) --------- */
    {
      name: 'Bomb Squad Tech', iconSlug: 'lorc/unlit-bomb', isEarth: true,
      blurb: 'Earth taught you to walk toward the thing everyone else is running from. The dungeon finds this hilarious.',
      traits: [
        { name: 'Steady Hands', tier: 'Minor', description: 'Fine work under conditions that should preclude it.', modifiers: [] },
        { name: 'Threat Assessment', tier: 'Moderate', description: 'You clock the trap before the room finishes loading.', modifiers: [m('INT', 1)] },
        { name: 'Controlled Detonation', tier: 'Major', description: 'It goes off where you decided it would.', modifiers: [m('INT', 1), m('DEX', 1)] },
        { name: 'Blast Suit Instincts', tier: 'Extreme', description: 'You survive things by knowing exactly how they kill.', modifiers: [m('slotCapacity', 1), m('CON', 1)] },
        { name: 'Nothing Surprises Me', tier: 'Epic', description: 'You have already imagined this going wrong, in detail, twice.', modifiers: [m('INT', 2), m('evade', 2)] }
      ]
    },
    {
      name: 'Prize Fighter', iconSlug: 'lorc/boxing-glove', isEarth: true,
      blurb: 'You got hit for money on Earth. The only change is the paperwork and the audience size.',
      traits: [
        { name: 'Trained Guard', tier: 'Minor', description: 'Your hands are up before you notice.', modifiers: [] },
        { name: 'Conditioning', tier: 'Moderate', description: 'Round eight is where other people stop.', modifiers: [m('CON', 1)] },
        { name: 'Knockout Power', tier: 'Major', description: 'One good one is all you have ever needed.', modifiers: [m('STR', 2)] },
        { name: 'Takes a Punch', tier: 'Extreme', description: 'Damage is information, not a reason to stop.', modifiers: [m('maxHealth', 10)] },
        { name: 'Crowd Work', tier: 'Epic', description: 'The audience paid to watch you specifically.', modifiers: [m('CHA', 2), m('aiFavor', 2)] }
      ]
    },
    {
      name: 'Trauma Surgeon', iconSlug: 'lorc/scalpel', isEarth: true,
      blurb: 'You have had both hands inside a stranger while somebody counted down. A dungeon is just a worse trauma bay.',
      traits: [
        { name: 'Triage', tier: 'Minor', description: 'You know who to work on first and you are right.', modifiers: [] },
        { name: 'Clinical Calm', tier: 'Moderate', description: 'Panic is a luxury for people with fewer responsibilities.', modifiers: [m('INT', 1)] },
        { name: 'Field Stabilization', tier: 'Major', description: 'You keep people on the correct side of the line.', modifiers: [m('maxMana', 4)] },
        { name: 'Anatomical Precision', tier: 'Extreme', description: 'You know exactly where everything is, on friends and otherwise.', modifiers: [m('DEX', 2)] },
        { name: 'Golden Hour', tier: 'Epic', description: 'Death becomes negotiable if you get there fast enough.', modifiers: [m('INT', 2), m('maxHealth', 8)] }
      ]
    },
    {
      name: 'Structural Engineer', iconSlug: 'delapouite/crane', isEarth: true,
      blurb: 'Everything the dungeon builds obeys load paths. You have been reading load paths since college.',
      traits: [
        { name: 'Load Path Intuition', tier: 'Minor', description: 'You know which wall is holding the rest up.', modifiers: [] },
        { name: 'Failure Analysis', tier: 'Moderate', description: 'You can see how it will come down.', modifiers: [m('INT', 1)] },
        { name: 'Improvised Fortification', tier: 'Major', description: 'Given rubble and an hour, you make a chokepoint.', modifiers: [m('slotCapacity', 1)] },
        { name: 'Controlled Collapse', tier: 'Extreme', description: 'The building becomes your weapon.', modifiers: [m('INT', 2), m('STR', 1)] },
        { name: 'Reads the Blueprint', tier: 'Epic', description: 'The floor plan is legible to you in a way the System did not intend.', modifiers: [m('INT', 3)] }
      ]
    },
    {
      name: 'Hostage Negotiator', iconSlug: 'lorc/conversation', isEarth: true,
      blurb: 'Every monster wants something. You have spent a career finding out what, while the clock ran.',
      traits: [
        { name: 'Active Listening', tier: 'Minor', description: 'People tell you more than they meant to.', modifiers: [] },
        { name: 'De-escalation', tier: 'Moderate', description: 'Some fights simply do not start.', modifiers: [m('CHA', 1)] },
        { name: 'Reads the Room', tier: 'Major', description: 'You know who is about to do something stupid.', modifiers: [m('CHA', 1), m('INT', 1)] },
        { name: 'The Long Conversation', tier: 'Extreme', description: 'Time is on your side because you make it be.', modifiers: [m('CHA', 2)] },
        { name: 'Everyone Walks Out', tier: 'Epic', description: 'The audience has never seen anything like it, and the System is furious.', modifiers: [m('CHA', 2), m('aiFavor', 3)] }
      ]
    },
    {
      name: 'Wildland Firefighter', iconSlug: 'lorc/burning-tree', isEarth: true,
      blurb: 'You dug line for sixteen hours in smoke. The dungeon has yet to show you a bad day.',
      traits: [
        { name: 'Smoke Tolerance', tier: 'Minor', description: 'Bad air is normal air.', modifiers: [] },
        { name: 'Hotshot Conditioning', tier: 'Moderate', description: 'You can carry it further than they can.', modifiers: [m('CON', 1)] },
        { name: 'Fire Behaviour', tier: 'Major', description: 'You know where it is going before it does.', modifiers: [m('INT', 1), m('evade', 1)] },
        { name: 'Cuts Line', tier: 'Extreme', description: 'You make the ground itself hold.', modifiers: [m('STR', 2)] },
        { name: 'Deployed the Shelter', tier: 'Epic', description: 'You have survived being overrun once already.', modifiers: [m('CON', 2), m('maxHealth', 10)] }
      ]
    }
  ];

  /* ---- Detriments ---------------------------------------------------------
   * BOOK: up to 5 points total, returning points at a two-for-one deficit, so
   * they never pay for themselves. Available to every build. */

  var detriments = [
    { name: 'Fine Motor Impairment', tier: 'Minor', description: 'Delicate work is out. Locks, wiring, surgery — find someone else.', modifiers: [m('DEX', -1)] },
    { name: 'Cold Vulnerability', tier: 'Minor', description: 'Ice floors are genuinely dangerous to you.', modifiers: [] },
    { name: 'Fire Vulnerability', tier: 'Minor', description: 'You burn easily and badly.', modifiers: [] },
    { name: 'Poor Night Vision', tier: 'Minor', description: 'You need a light source. Always.', modifiers: [] },
    { name: 'Bad Knees', tier: 'Moderate', description: 'Distance and stairs both extract a toll.', modifiers: [m('CON', -1)] },
    { name: 'Weapon Ban: Edged', tier: 'Moderate', description: 'A vow, a curse, or a phobia — you will not use blades.', modifiers: [] },
    { name: 'Glass Jaw', tier: 'Moderate', description: 'You go down faster than your build suggests.', modifiers: [m('maxHealth', -6)] },
    { name: 'Unsettling', tier: 'Moderate', description: 'Something about you reads wrong to strangers and audiences alike.', modifiers: [m('CHA', -1)] },
    { name: 'Mana Scarring', tier: 'Major', description: 'Your reservoir leaks. Casting costs more than it should.', modifiers: [m('maxMana', -4)] },
    { name: 'Slow to React', tier: 'Major', description: 'You are consistently a half-beat behind.', modifiers: [m('evade', -2)] },
    { name: 'Frail Frame', tier: 'Major', description: 'Everything hits you harder than it hits anyone else.', modifiers: [m('slotCapacity', -1)] },
    { name: 'Marked by the System', tier: 'Extreme', description: 'The AI has taken a personal dislike to you and does not hide it.', modifiers: [m('aiFavor', -1), m('CHA', -1)] },
    { name: 'Chronic Pain', tier: 'Extreme', description: 'A permanent background cost to everything you do.', modifiers: [m('STR', -1), m('CON', -1)] }
  ];

  function findRace(name) { return races.filter(function (r) { return r.name === name; })[0] || null; }
  function findClass(name) { return classes.filter(function (c) { return c.name === name; })[0] || null; }

  /* Every trait a given build could buy, flattened and tagged with its source
   * so the Build view can group them and the store can persist the origin. */
  function availableTraits(raceName, className) {
    var out = [];
    var r = findRace(raceName);
    var c = findClass(className);
    if (r) r.traits.forEach(function (t) { out.push(Object.assign({ source: 'race', sourceName: r.name }, t)); });
    if (c) c.traits.forEach(function (t) { out.push(Object.assign({ source: c.isEarth ? 'earth' : 'class', sourceName: c.name }, t)); });
    detriments.forEach(function (t) { out.push(Object.assign({ source: 'detriment', sourceName: 'Detriment', isDetriment: true }, t)); });
    return out;
  }

  /* BOOK: Earth classes require an Earth-native race. Human counts as native;
   * Primal is the one that explicitly grants access at a permanent cost. */
  function earthUnlocked(raceName) {
    var r = findRace(raceName);
    return !!(r && r.isEarth);
  }

  return {
    races: races,
    classes: classes,
    detriments: detriments,
    findRace: findRace,
    findClass: findClass,
    availableTraits: availableTraits,
    earthUnlocked: earthUnlocked
  };
})();
