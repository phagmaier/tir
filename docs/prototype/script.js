/* PROTOTYPE, throwaway. An original sample script, a rough paginator and a
   page renderer, for the look prototype only. This is not Tir's layout
   engine: indents and widths follow docs/findings.md, but the page-break
   rules here are approximations, and 54 lines per page is not yet settled. */
(function () {
  'use strict';

  const LINES_PER_PAGE = 54;
  const SPEC = {
    scene: { w: 60, sb: 2 },
    action: { w: 60, sb: 1 },
    character: { w: 37, sb: 1 },
    paren: { w: 25, first: 26, sb: 0 },
    dialogue: { w: 35, sb: 0 },
    transition: { w: 16, sb: 1 },
    shot: { w: 60, sb: 2 },
    general: { w: 60, sb: 0 },
  };
  const LABELS = {
    scene: 'Scene Heading', action: 'Action', character: 'Character',
    paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition',
    shot: 'Shot', general: 'General',
  };
  const SHORT = {
    scene: 'Scene', action: 'Action', character: 'Character', paren: 'Paren',
    dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', general: 'General',
  };
  const ORDER = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'general'];
  const KEYS = { scene: '1', action: '2', character: '3', paren: '4', dialogue: '5', transition: '6', shot: '7', general: '0' };
  const UPPER = new Set(['scene', 'character', 'transition', 'shot']);
  const MISSPELLED = new Set(['recieve', 'definately', 'seperate']);
  const TIMES = ['NIGHT', 'DAY', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'MORNING', 'EVENING'];

  // S scene, A action, C character (name|extension), P parenthetical,
  // D dialogue, T transition, H shot, X dual dialogue, E empty action,
  // L the scene heading being typed. An original script written for this
  // prototype.
  const SAMPLE = `
S|EXT. HALVARD HARBOR - NIGHT
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
L|INT. HALCYON - WHEELHOUSE - `;

  const CODE = { S: 'scene', A: 'action', C: 'character', P: 'paren', D: 'dialogue', T: 'transition', H: 'shot', E: 'action', L: 'scene' };

  function parse(text) {
    const els = [];
    for (const raw of text.split('\n')) {
      if (!raw.trim()) continue;
      const parts = raw.split('|');
      const code = parts[0];
      if (code === 'X') {
        els.push({ t: 'dual', a: { name: parts[1], text: parts[2] }, b: { name: parts[3], text: parts[4] } });
      } else if (code === 'C') {
        els.push({ t: 'character', text: parts[1], ext: parts[2] || '' });
      } else {
        const el = { t: CODE[code], text: code === 'E' ? '' : parts.slice(1).join('|') };
        if (code === 'L') el.live = true;
        els.push(el);
      }
    }
    return els;
  }

  function wrap(text, w, wFirst) {
    if (!text) return [''];
    const words = text.split(/ +/);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const lim = lines.length === 0 ? (wFirst || w) : w;
      if (!cur) cur = word;
      else if (cur.length + 1 + word.length <= lim) cur += ' ' + word;
      else { lines.push(cur); cur = word; }
    }
    lines.push(cur);
    return lines;
  }

  // Split text at the last sentence end whose first part fits in maxLines,
  // keeping at least two lines on each side. Returns [headLines, tailLines].
  function splitText(text, w, maxLines) {
    const sents = text.match(/[^.?!]+[.?!]+["')]*\s*|[^.?!]+$/g) || [text];
    for (let k = sents.length - 1; k >= 1; k--) {
      const head = wrap(sents.slice(0, k).join('').trim(), w);
      const tail = wrap(sents.slice(k).join('').trim(), w);
      if (head.length <= maxLines && head.length >= 2 && tail.length >= 2) return [head, tail];
    }
    return null;
  }

  // Group elements into units: a dialogue block (cue plus its parentheticals
  // and dialogue) or a single element. Adds the automatic (CONT'D).
  function buildUnits(els) {
    const units = [];
    let lastSpeaker = null;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.t === 'scene') lastSpeaker = null;
      if (el.t === 'dual') {
        const col = (c) => ({ cue: c.name, lines: wrap(c.text, 27) });
        units.push({ kind: 'dual', i, sb: 1, cols: [col(el.a), col(el.b)] });
        lastSpeaker = null;
        continue;
      }
      if (el.t === 'character') {
        const contd = lastSpeaker === el.text;
        lastSpeaker = el.text;
        const cueText = [el.text, el.ext, contd ? "(CONT'D)" : ''].filter(Boolean).join(' ');
        const parts = [{ t: 'character', i, lines: wrap(cueText, 37) }];
        let j = i + 1;
        while (j < els.length && (els[j].t === 'paren' || els[j].t === 'dialogue')) {
          const s = SPEC[els[j].t];
          parts.push({ t: els[j].t, i: j, text: els[j].text, lines: wrap(els[j].text, s.w, s.first) });
          j++;
        }
        units.push({ kind: 'block', i, sb: 1, parts, name: el.text, ext: el.ext, cueText });
        i = j - 1;
        continue;
      }
      const s = SPEC[el.t];
      units.push({ kind: 'single', t: el.t, i, sb: s.sb, text: el.text, lines: wrap(el.text, s.w, s.first), live: !!el.live });
    }
    return units;
  }

  const unitLines = (u) => u.kind === 'dual'
    ? 1 + Math.max(u.cols[0].lines.length, u.cols[1].lines.length)
    : u.kind === 'block' ? u.parts.reduce((n, p) => n + p.lines.length, 0) : u.lines.length;

  const minLines = (u) => u.kind === 'block'
    ? 1 + Math.min(2, (u.parts[1] ? u.parts[1].lines.length : 0))
    : u.kind === 'dual' ? unitLines(u) : Math.min(2, u.lines.length);

  function paginate(units) {
    const pages = [];
    let page = [];
    let used = 0;
    const flush = () => { if (page.length) pages.push(page); page = []; used = 0; };
    const sbNow = (sb) => (used === 0 ? 0 : sb);
    const put = (item, sb) => {
      item.sb = sbNow(sb);
      used += item.sb + (item.lines ? item.lines.length : item.height);
      page.push(item);
    };

    for (let k = 0; k < units.length; k++) {
      const u = units[k];
      const h = sbNow(u.sb) + unitLines(u);
      const fits = used + h <= LINES_PER_PAGE;

      if (u.kind === 'single' && (u.t === 'scene' || u.t === 'shot')) {
        const next = units[k + 1];
        const need = h + (next ? next.sb + minLines(next) : 0);
        if (used + need > LINES_PER_PAGE) flush();
        put({ t: u.t, i: u.i, lines: u.lines, live: u.live }, u.sb);
        continue;
      }

      if (fits) {
        if (u.kind === 'dual') put({ t: 'dual', i: u.i, cols: u.cols, height: unitLines(u) }, u.sb);
        else if (u.kind === 'block') u.parts.forEach((p, n) => put({ t: p.t, i: p.i, lines: p.lines }, n === 0 ? u.sb : 0));
        else put({ t: u.t, i: u.i, lines: u.lines, live: u.live }, u.sb);
        continue;
      }

      if (u.kind === 'single' && (u.t === 'action' || u.t === 'general')) {
        // Final Draft splits action only at a sentence end; both halves re-wrap.
        const split = splitText(u.text, SPEC[u.t].w, LINES_PER_PAGE - used - sbNow(u.sb));
        if (split) {
          put({ t: u.t, i: u.i, lines: split[0], part: 'head' }, u.sb);
          flush();
          put({ t: u.t, i: u.i, lines: split[1], part: 'tail' }, 0);
        } else { flush(); put({ t: u.t, i: u.i, lines: u.lines }, u.sb); }
        continue;
      }

      if (u.kind === 'block') {
        // Split a speech across the page with (MORE) and (CONT'D): inside a
        // dialogue at a sentence end, or between its parts, keeping the cue
        // with at least two lines.
        const avail = LINES_PER_PAGE - used - sbNow(u.sb) - 1;
        const head = [];
        let tail = null;
        let acc = 0;
        for (let pi = 0; pi < u.parts.length; pi++) {
          const p = u.parts[pi];
          if (acc + p.lines.length <= avail) { head.push(p); acc += p.lines.length; continue; }
          if (p.t === 'dialogue') {
            const split = splitText(p.text, SPEC.dialogue.w, avail - acc);
            if (split) { head.push({ ...p, lines: split[0] }); tail = [{ ...p, lines: split[1] }, ...u.parts.slice(pi + 1)]; }
          }
          if (!tail && pi >= 2 && u.parts[pi - 1].t === 'dialogue') tail = u.parts.slice(pi);
          break;
        }
        const bodyLines = head.slice(1).reduce((n, p) => n + p.lines.length, 0);
        if (tail && bodyLines >= 2) {
          head.forEach((p, n) => put({ t: p.t, i: p.i, lines: p.lines, part: 'head' }, n === 0 ? u.sb : 0));
          put({ t: 'more', i: u.i, lines: ['(MORE)'] }, 0);
          flush();
          const cue = /\(CONT'D\)/.test(u.cueText) ? u.cueText : u.cueText + " (CONT'D)";
          put({ t: 'character', i: u.i, lines: [cue], part: 'tail' }, 0);
          tail.forEach((p) => put({ t: p.t, i: p.i, lines: p.lines, part: 'tail' }, 0));
        } else {
          flush();
          u.parts.forEach((p, n) => put({ t: p.t, i: p.i, lines: p.lines }, n === 0 ? u.sb : 0));
        }
        continue;
      }

      flush();
      if (u.kind === 'dual') put({ t: 'dual', i: u.i, cols: u.cols, height: unitLines(u) }, u.sb);
      else put({ t: u.t, i: u.i, lines: u.lines, live: u.live }, u.sb);
    }
    flush();
    return pages;
  }

  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  function check(els) {
    const findings = [];
    const counts = {};
    els.forEach((el) => { if (el.t === 'character') counts[el.text] = (counts[el.text] || 0) + 1; });
    els.forEach((el, i) => {
      if (el.t === 'character' && counts[el.text] === 1) {
        const near = Object.keys(counts).find((n) => n !== el.text && counts[n] > 1 && editDistance(n, el.text) <= 1);
        if (near) findings.push({ i, msg: `<b>${el.text}</b> speaks once and is one letter away from <b>${near}</b>, who has ${counts[near]} cues. A typo?` });
      }
      if (el.t === 'character') {
        const next = els[i + 1];
        if (!next || (next.t !== 'dialogue' && next.t !== 'paren')) findings.push({ i, msg: 'This character cue has no dialogue under it.' });
      }
      if (el.t !== 'dual' && !el.live && el.text === '') findings.push({ i, msg: `Empty ${LABELS[el.t].toLowerCase()} paragraph. It prints as a stray blank line.` });
    });
    return findings;
  }

  function layout(els) {
    const pages = paginate(buildUnits(els));
    const pageOf = {};
    pages.forEach((items, p) => items.forEach((it) => { if (!(it.i in pageOf)) pageOf[it.i] = p + 1; }));
    const scenes = [];
    els.forEach((el, i) => {
      if (el.t !== 'scene') return;
      const next = els.slice(i + 1).find((e) => e.t === 'action' && e.text);
      scenes.push({ n: scenes.length + 1, i, heading: el.text.trim(), page: pageOf[i], preview: next ? next.text : '' });
    });
    const sceneOf = {};
    let s = 0;
    els.forEach((el, i) => { if (el.t === 'scene') s = scenes.findIndex((x) => x.i === i) + 1; sceneOf[i] = s; });
    return { pages, scenes, sceneOf, pageOf, findings: check(els) };
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function findRegex(f) {
    if (!f || !f.open || !f.q) return null;
    let src = f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (f.whole) src = `\\b${src}\\b`;
    return new RegExp(src, f.matchCase ? 'g' : 'gi');
  }

  function decorate(line, t, ctx) {
    const ranges = [];
    if (ctx.re) {
      ctx.re.lastIndex = 0;
      let m;
      while ((m = ctx.re.exec(line))) {
        const n = ctx.hits++;
        ctx.hitEls.push(ctx.i);
        ranges.push([m.index, m.index + m[0].length, n === ctx.curHit ? 'hit cur' : 'hit', n === ctx.curHit ? ' id="curhit"' : '']);
        if (m[0].length === 0) ctx.re.lastIndex++;
      }
    }
    if (t !== 'character' && t !== 'more') {
      const w = /[A-Za-z']+/g;
      let m;
      while ((m = w.exec(line))) {
        if (MISSPELLED.has(m[0].toLowerCase())) ranges.push([m.index, m.index + m[0].length, 'sp', ' title="Spelling: receive?"']);
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let out = '';
    let pos = 0;
    for (const [s, e, cls, attr] of ranges) {
      if (s < pos) continue;
      out += esc(line.slice(pos, s)) + `<span class="${cls}"${attr}>` + esc(line.slice(s, e)) + '</span>';
      pos = e;
    }
    return out + esc(line.slice(pos));
  }

  // opts: { cur, find, ac, marginLabel, findings }
  function renderPages(container, lay, opts) {
    const ctx = { re: findRegex(opts.find), hits: 0, hitEls: [], i: -1, curHit: opts.find ? opts.find.cur : -1 };
    const fmap = {};
    lay.findings.forEach((f) => { fmap[f.i] = f.msg; });
    const marked = new Set();
    let html = '';
    lay.pages.forEach((items, p) => {
      html += `<div class="sheet" data-page="${p + 1}"><div class="pn">${p > 0 ? (p + 1) + '.' : ''}</div><div class="body">`;
      for (const it of items) {
        ctx.i = it.i;
        const isCur = it.i === opts.cur && it.t !== 'more' && it.part !== 'head';
        let inner = '';
        if (fmap[it.i] !== undefined && !marked.has(it.i) && it.t !== 'more') {
          marked.add(it.i);
          inner += `<span class="mark" tabindex="0" aria-label="Formatting finding"><span class="tip">${fmap[it.i]}</span></span>`;
        }
        if (isCur && opts.marginLabel) inner += `<span class="mlabel">${LABELS[it.t] || ''}</span>`;
        if (it.t === 'dual') {
          inner += it.cols.map((c, n) => `<div class="dcol d${n}"><div class="ln cue">${decorate(c.cue, 'character', ctx)}</div>${c.lines.map((l) => `<div class="ln">${decorate(l, 'dialogue', ctx)}</div>`).join('')}</div>`).join('');
        } else {
          it.lines.forEach((l, n) => {
            let lineHtml = decorate(l, it.t, ctx);
            const lastLine = n === it.lines.length - 1;
            if (isCur && lastLine) {
              lineHtml += '<span class="caret"></span>';
              if (it.live && opts.ac) {
                lineHtml += '<span class="ghost">NIGHT</span>';
                lineHtml += `<span class="ac" style="left:${l.length}ch"><span class="ac-h">Time of day</span>${TIMES.map((x, k) => `<span class="ac-o${k === 0 ? ' on' : ''}">${x}${k === 0 ? '<i>used 9×</i>' : ''}</span>`).join('')}<span class="ac-f">Enter accepts · ↑↓ choose · Esc</span></span>`;
              }
            }
            inner += `<div class="ln">${lineHtml || ''}</div>`;
          });
        }
        const flagged = fmap[it.i] !== undefined ? ' flagged' : '';
        html += `<div class="el el-${it.t} sb${it.sb}${isCur ? ' cur' : ''}${flagged}" data-i="${it.i}">${inner}</div>`;
      }
      html += '</div></div>';
    });
    container.innerHTML = html;
    return { hits: ctx.hits, hitEls: ctx.hitEls };
  }

  window.TirProto = { LABELS, SHORT, ORDER, KEYS, UPPER, SAMPLE, parse, layout, renderPages, findRegex };
})();
