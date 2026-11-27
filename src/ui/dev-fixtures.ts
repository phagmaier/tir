/**
 * The scripts Tir opens with `?fixture=NAME` until it can open a draft
 * (task 1.9), for measuring and checking the editor (architecture,
 * "Measuring the editor"). All are original, written for Tir or its
 * prototype.
 */
import { everyFormat, featureScript } from "../core/fixtures/scripts.ts";
import { type Element, type ElementType, newTitlePage, type Script } from "../core/model.ts";

const action = [
  "The lights on the empty platform start to flicker. A small bird picks at a gap in the pavement.",
  "Mara tightens the strap on her bag and watches the last train pull away. Beyond the glass, the rain lets up.",
  "She sets the bag down by the end of the bench. The station clock clicks forward a minute.",
  "Footsteps pass along the street above her, brisk and then gone. She scans the track for a light.",
];

/** 120 pages, each a scene of 16 actions and a speech after a forced break (task 1.1). */
const spike: Element[] = Array.from({ length: 120 }, (_, page): Element[] => [
  {
    type: "sceneHeading",
    text: `INT. STATION ${page + 1} - NIGHT`,
    ...(page ? { pageBreakBefore: true } : {}),
  },
  ...Array.from(
    { length: 16 },
    (_, i): Element => ({ type: "action", text: action[i % action.length] as string }),
  ),
  { type: "character", text: "MARA" },
  { type: "dialogue", text: "Still here." },
]).flat();

/**
 * The script of prototype piece 5 (docs/prototype/script.js), one element
 * a line: a type code, then the text. `C|NAME|(V.O.)` is a cue with an
 * extension, `X|LEFT|speech|RIGHT|speech` dual dialogue, `E|` an empty
 * action, and the last line a scene heading still being typed.
 */
const SAMPLE = `S|EXT. HALVARD HARBOR - NIGHT
A|Rain hammers a small island harbor. A single ferry, the HALCYON, strains at her moorings, her cabin lights the only warm thing for miles.
A|MARA OKAFOR (40s, oilskin coat, a face that has argued with weather and won) coils a mooring line with practiced, furious speed.
A|TEO (16, all elbows, a phone held like a talisman) skids down the slick ramp toward her.
C|TEO
D|You said we weren't running tonight.
C|MARA
P|(not looking up)
D|I said we weren't running for tourists.
C|TEO
D|Who else would be out in this?
A|Mara nods toward the end of the pier. A FIGURE waits beneath the last working lamp, motionless, a hard-shell case at their feet.
C|MARA
D|Someone who paid triple.
S|INT. HALCYON - WHEELHOUSE - NIGHT
A|Cramped. Instruments glow green. A thermos rolls across the console; Mara stops it without looking.
A|Teo wipes fog from the glass. The figure, aboard now, stands alone on the deck below, still holding the case.
C|TEO
D|They haven't moved.
C|MARA
D|Then they're the easiest passenger I've had all year.
A|She eases the throttle forward. The engine groans. The harbor lights slide away into the dark.
C|RADIO|(V.O.)
D|Halcyon, Halcyon, this is Ferris Point. Confirm you are not underway. Over.
A|Mara regards the radio for a long moment. Then turns the volume all the way down.
C|TEO
D|Aunt Mara.
C|MARA
D|The coast guard thinks every wave is a personal insult. We'll be across before they finish their coffee.
S|EXT. HALCYON - DECK - CONTINUOUS
A|Spray explodes over the rail. Teo edges along it, one hand locked on the safety line, a second thermos tucked under his arm.
A|The passenger, ELLIS VANE (60s, immaculate, entirely too calm), watches the black water as if it owes him money.
A|Somewhere below them, something heavy shifts in the hold and settles. Neither of them looks down.
C|TEO
D|Coffee? It's mostly coffee.
C|ELLIS
P|(taking it)
D|You're the nephew.
C|TEO
D|Is that on the ticket?
A|Ellis almost smiles. He turns the cup in his gloved hands, studying the boy.
C|ELLIS
D|Your aunt and I go back. Further than she would like to admit. Does she still keep the logbook in the chart drawer, under the tide tables? She used to say paper was the only thing on this boat that never lied to her. I suppose some things don't change. Not after twenty years. Not after a great deal of bad weather. Tell her I said so. And tell her I'm sorry about the lamp.
A|Teo stares at him. Ellis sips the coffee and makes a face.
C|ELLIS
D|Mostly.
S|INT. HALCYON - WHEELHOUSE - NIGHT
A|Teo stumbles in, soaked to the bone, and slams the door against the wind.
C|TEO
D|He knows about the logbook.
A|Mara's hand stops on the throttle.
C|MARA
D|What did he say? Exactly.
C|TEO
D|That paper never lies. And that he's sorry about the lamp.
A|A long beat. Mara pulls open the chart drawer. Lifts the tide tables. The logbook is there, its cover warped by old water. She doesn't open it.
C|MARA
D|Take the wheel.
A|She presses the logbook inside her coat, already moving.
C|MARA
D|Keep the bow into the swell. If it feels wrong, it is.
S|EXT. HALCYON - DECK - CONTINUOUS
A|Mara crosses the pitching deck. Ellis doesn't turn around.
C|ELLIS
D|Hello, Mara.
C|MARA
D|You told me you would never come back to this island.
C|ELIS
D|I told you a great many things.
A|He nudges the case toward her with the toe of one polished shoe.
X|MARA|Get off my boat.|ELLIS|I need the logbook.
C|MARA
D|We're in the middle of the sound.
C|ELLIS
D|Then I suppose you'll have to listen.
S|INT. HALCYON - WHEELHOUSE - CONTINUOUS
A|Teo fights the wheel. Through the streaming window: Mara and Ellis, arguing, the case between them like a third passenger.
A|A light blinks on the radar screen. Then another. Then four.
C|TEO
P|(into the radio)
D|Ferris Point, this is Halcyon. I think we have company.
C|RADIO|(V.O.)
D|Halcyon, say again. We recieve nothing on our screen.
T|CUT TO:
S|EXT. OPEN WATER - NIGHT
H|WIDE ON THE SOUND
A|Four dark hulls, running without lights, fan out across the Halcyon's wake like fingers closing.
S|INT. HALCYON - GALLEY - NIGHT
A|A single bulb swings overhead. Ellis sets the case on the table and opens the latches.
E|
A|Inside, nested in grey foam: an old brass ship's chronometer, its glass cracked, its hands still moving.
C|MARA
D|That's my father's.
C|ELLIS
D|It was. And the men behind us would very much like to know why it keeps the wrong time.
A|Mara looks from the chronometer to the porthole. Out in the dark, an engine answers theirs.
S|EXT. FERRIS POINT LIGHTHOUSE - NIGHT
A|The great lamp turns. Its beam sweeps the water, finds the Halcyon, and passes on.
A|It does not find the four boats behind her.
S|INT. HALCYON - WHEELHOUSE - `;

const CODES: Record<string, ElementType> = {
  S: "sceneHeading",
  A: "action",
  E: "action",
  C: "character",
  P: "parenthetical",
  D: "dialogue",
  T: "transition",
  H: "shot",
};

function sample(): Element[] {
  return SAMPLE.split("\n").flatMap((line): Element[] => {
    const [code = "", ...parts] = line.split("|");
    if (code === "X") {
      const [left, leftSpeech, right, rightSpeech] = parts as [string, string, string, string];
      return [
        { type: "character", text: left },
        { type: "dialogue", text: leftSpeech },
        { type: "character", text: right, dual: true },
        { type: "dialogue", text: rightSpeech },
      ];
    }
    return [{ type: CODES[code] as ElementType, text: parts.join(" ") }];
  });
}

/**
 * Elements typed in lower case where the engine sets capitals, with an "ß",
 * whose capital is two letters and so stays as typed, and an accented
 * letter, which takes its capital.
 */
const TYPED_LOWER: Element[] = [
  { type: "sceneHeading", text: "ext. große straße - dawn" },
  { type: "action", text: "The street is empty. A shutter goes up." },
  { type: "character", text: "josé (v.o.)" },
  { type: "dialogue", text: "Open up, it's me." },
  { type: "shot", text: "close on the shutter" },
  { type: "transition", text: "fade out." },
];

/** The script for `?fixture=NAME`: `feature`, `every`, `sample`, or else the 120-page spike. */
export function devScript(name: string | null): Script {
  switch (name) {
    case "feature":
      return { titlePage: newTitlePage(), elements: featureScript(150) };
    case "every":
      return { ...everyFormat, elements: [...everyFormat.elements, ...TYPED_LOWER] };
    case "sample":
      return { titlePage: { ...newTitlePage(), title: "Salt Line" }, elements: sample() };
    default:
      return { titlePage: newTitlePage(), elements: spike };
  }
}
