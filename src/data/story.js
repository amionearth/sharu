export const openingCutscene = [
  { speaker: 'MOTHER', line: 'Sheru, counter clean aakkiyo?', character: 'mother' },
  { speaker: 'SHERU', line: 'Clean aakki, amme.', character: 'sheru' },
  { speaker: 'MOTHER', line: 'Ithaano clean aakkiyathu?', character: 'mother' },
  { speaker: 'SHERU', line: 'Athu counter-inte original colour-aa. Njan maattan ninnilla.', character: 'sheru' },
  { speaker: 'MOTHER', line: 'Ravile thanne enne kondu parayippikkalle.', character: 'mother' },
  { speaker: 'CUSTOMER', line: 'Oru papaya juice.', character: 'customer' },
  { speaker: 'SHERU', line: 'Da, healthy healthy!', character: 'sheru' },
  { speaker: 'CUSTOMER', line: 'Sugar venda, venda.', character: 'customer' },
  { speaker: 'SHERU', line: 'Da, healthy kutta!', character: 'sheru' },
  { speaker: 'CUSTOMER', line: 'Kooda randu mutta puffs-um.', character: 'customer' },
  { speaker: 'SHERU', line: 'Eda gomale... juice-il sugar venda, puffs-il mutta venam. Enthuvaada ee diet?', character: 'sheru' },
  { speaker: 'CUSTOMER', line: 'Athu cheat meal aanu.', character: 'customer' },
  { speaker: 'SHERU', line: 'Cheat meal alla chetta, diet-ne konnu kuzhichu moodiyatha.', character: 'sheru' },
  { speaker: 'MOTHER', line: 'Sheru, mindaathe juice adikku.', character: 'mother' },
  { speaker: 'SHERU', line: 'Njan mindaathirikkaam. Iyalude diet kandittu mixer polum karayunnundu.', character: 'sheru' },
];

export const missionOne = {
  id: 'juice-master',
  title: 'JUICE MASTER',
  location: 'MAHE · MOTHER’S JUICE SHOP',
  rewards: 120,
  steps: [
    'Talk to Amma at the juice counter.',
    'Pick up papaya from the fruit crate.',
    'Prepare the papaya on the cutting board.',
    'Blend the juice — no sugar.',
    'Serve the customer at the counter.',
    'Collect payment from the customer.',
  ],
  stations: ['mother', 'fruit', 'board', 'blender', 'customer', 'payment'],
  lines: {
    wait: 'Mone, juice aano undaakkunnathu, papayayude jaathakam nokkuvaano?',
    wrong: 'Njan sugar venda ennu paranjille?',
    wrongReply: 'Paranjirunnu. Ente chevikk kettatha. Kaikku kurachu ormak kuravaa.',
    finishMother: 'Oru juice undaakkaan ithrayum neramo?',
    finishSheru: 'Quality time edukum.',
  },
};

export const npcDirectory = {
  mother: { name: 'Amma', role: 'SHERU’S MOTHER · JUICE SHOP', initials: 'AM', model: 'women-0.glb', voice: 'female', opener: 'Counter clean aakkiyo, mone? Customer wait cheyyunnu.' },
  jomon: { name: 'Jomon', role: 'SHERU’S CHILDHOOD FRIEND', initials: 'JM', model: 'men-1.glb', voice: 'male', opener: 'Sheru, plan undu. Pakshe cash nee nokkanam.' },
  bhishma: { name: 'Bhishma', role: 'SHARU’S FATHER’S RIGHT HAND', initials: 'BH', model: 'Bhishma.glb', voice: 'male', opener: 'Sharu sir, oru vishayam parayaanundu. Ithu kettittu panic aakaruthu.' },
  latha: { name: 'Latha', role: 'NEIGHBOURING SHOPKEEPER', initials: 'LT', model: 'women-1.glb', voice: 'female', opener: 'Sheru, ninte amma chodicha saadhanam konduvanno?' },
  raghavan: { name: 'Raghavan', role: 'TEA-SHOP OWNER', initials: 'RG', model: 'men-2.glb', voice: 'male', opener: 'Oru chaaya kudichittu para, entha vishesham?' },
  shibu: { name: 'Shibu', role: 'LOCAL MECHANIC', initials: 'SB', model: 'men-0.glb', voice: 'male', opener: 'Enikku ella bike-um sheriyakkaan ariyaam. Almost.' },
  kunjikka: { name: 'Kunjikka', role: 'FISHERMAN', initials: 'KJ', model: 'men-3.glb', voice: 'male', opener: 'Kadalu shanthamaanu. Manushyar maathram busy.' },
  customer: { name: 'Customer', role: 'PAPAYA JUICE · TWO EGG PUFFS', initials: 'CU', model: 'men-0.glb', voice: 'male', opener: 'Oru papaya juice. Sugar venda. Kooda randu mutta puffs-um.' },
  worker: { name: 'Harbour Worker', role: 'KOCHI HARBOUR', initials: 'HW', model: 'men-2.glb', voice: 'male', opener: 'Rajan Bhaiye ariyam. Ninne ariyan enikku kaaranam venam.' },
};
