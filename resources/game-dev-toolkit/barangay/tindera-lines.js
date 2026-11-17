/**
 * tindera-lines.js — what Aling Nena says.
 *
 * Filipino first, with a small English gloss under it so the scene is readable
 * if you do not speak Tagalog. Voice clips were NOT recovered from the previous
 * workspace: the earlier build used a session-bound voice id that cannot be
 * assumed portable, so dialogue is subtitled only until new audio is recorded.
 */

export const TINDERA_NAME = "Aling Nena";

export const LINES = {
  greetMorning: {
    fil: "Magandang umaga, iho. Ang aga mo ah.",
    en: "Good morning, son. You're up early.",
  },
  greetAfternoon: {
    fil: "Magandang hapon, Ernie. Ano'ng kailangan mo?",
    en: "Good afternoon, Ernie. What do you need?",
  },
  greetNight: {
    fil: "Naku, gabing-gabi na. Bakit gising ka pa, iho?",
    en: "It's the middle of the night. Why are you still awake, son?",
  },
  shopOpen: {
    fil: "Ano ang bibilhin mo? May barya ka ba?",
    en: "What are you buying? Do you have change?",
  },
  bought: {
    fil: "Sige, iho. Ingat ka sa daan.",
    en: "Alright, son. Take care on the road.",
  },
  noCredit: {
    fil: "Naku, iho, kulang ang pera mo. Hindi ako nagpapautang ngayong gabi.",
    en: "Your money's short, son. I'm not giving credit tonight.",
  },
  bagFullish: {
    fil: "Huwag kang masyadong magdala ng marami. Mabigat iyan.",
    en: "Don't carry too much. That's heavy.",
  },
  aboutMissing: {
    fil:
      "Tatlo na ang nawawalang bata dito sa Kabudoy ngayong linggo. Puro gabi, puro sa may kalsada. " +
      "Sarhan mo ang pinto, iho. At huwag kang lalabas kapag tumilaok na ang manok... teka, wala pang manok.",
    en:
      "Three children have gone missing in Kabudoy this week. Always at night, always near the road. " +
      "Lock your door, son. And don't go out when the rooster crows... wait, it isn't even dawn.",
  },
  aboutSister: {
    fil:
      "Si Lisa? Oo, nakita ko siyang dumaan dito kagabi. Papunta raw sa may bulwagan. " +
      "Alam mo naman, bawal maglakad doon pagkatapos ng alas-diyes. Ngayon... hindi ko na siya nakita.",
    en:
      "Lisa? Yes, I saw her pass by last night. She said she was going to the hall. " +
      "You know it's not safe to walk there after ten. Now... I haven't seen her since.",
  },
  aboutHall: {
    fil:
      "Malayo ang bulwagan, iho. Doon sa dulo ng kalsada, lampas pa ng sagingan. " +
      "May ilaw doon kahit walang tao. Kakaiba.",
    en:
      "The hall is far, son. At the end of the road, past the banana grove. " +
      "There are lights on there even when nobody's inside. Strange.",
  },
  closeShop: {
    fil: "Ingat ka, iho. Umuwi ka agad.",
    en: "Take care, son. Go straight home.",
  },
  hallLocked: {
    fil: "(Naka-kandado ang bulwagan. May malamig na simoy mula sa loob.)",
    en: "(The hall is padlocked. A cold draught comes from inside.)",
  },
  benchSit: {
    fil: "(Umupo ka sa upuan. Sumasayaw ang ilaw ng poste sa kalsada.)",
    en: "(You sit on the bench. The street lamp sways over the road.)",
  },
  doorOpen: {
    fil: "(Bumukas ang pinto. Malamig ang loob ng bahay — mas malamig kaysa sa kalsada.)",
    en: "(The door swings open. The house is cold inside — colder than the street.)",
  },
  doorClose: {
    fil: "(Isinara mo ang pinto. Nanatili ang amoy ng basang kahoy.)",
    en: "(You close the door. The smell of wet wood stays.)",
  },
  radioOn: {
    fil: "(Radyo: mahinang tugtog. Pero may sumisingit na tinig tuwing hihina ang signal.)",
    en: "(Radio: a faint tune. Something like a voice slips in whenever the signal fades.)",
  },
};

export function timeGreeting(hours) {
  if (hours >= 5 && hours < 12) return LINES.greetMorning;
  if (hours >= 12 && hours < 18) return LINES.greetAfternoon;
  return LINES.greetNight;
}
