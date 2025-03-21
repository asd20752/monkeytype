import * as Notifications from "../elements/notifications";
import * as ThemeColors from "../elements/theme-colors";
import Config, * as UpdateConfig from "../config";
import * as DB from "../db";
import * as TestWords from "./test-words";
import * as TestInput from "./test-input";
import * as CustomText from "./custom-text";
import * as Caret from "./caret";
import * as OutOfFocus from "./out-of-focus";
import * as Replay from "./replay";
import * as Misc from "../utils/misc";
import * as SlowTimer from "../states/slow-timer";
import * as CompositionState from "../states/composition";
import * as ConfigEvent from "../observables/config-event";
import * as Hangul from "hangul-js";
import format from "date-fns/format";
import { Auth } from "../firebase";
import { skipXpBreakdown } from "../elements/account-button";
import * as FunboxList from "./funbox/funbox-list";

ConfigEvent.subscribe((eventKey, eventValue) => {
  if (eventValue === undefined || typeof eventValue !== "boolean") return;
  if (eventKey === "flipTestColors") flipColors(eventValue);
  if (eventKey === "colorfulMode") colorful(eventValue);
  if (eventKey === "highlightMode") updateWordElement(eventValue);
  if (eventKey === "burstHeatmap") applyBurstHeatmap();
});

export let currentWordElementIndex = 0;
export let resultVisible = false;
export let activeWordTop = 0;
export let testRestarting = false;
export let testRestartingPromise: Promise<unknown>;
export let lineTransition = false;
export let currentTestLine = 0;
export let resultCalculating = false;

export function setResultVisible(val: boolean): void {
  resultVisible = val;
}

export function setCurrentWordElementIndex(val: number): void {
  currentWordElementIndex = val;
}

export function setActiveWordTop(val: number): void {
  activeWordTop = val;
}

let restartingResolve: null | ((value?: unknown) => void);
export function setTestRestarting(val: boolean): void {
  testRestarting = val;
  if (val === true) {
    testRestartingPromise = new Promise((resolve) => {
      restartingResolve = resolve;
    });
  } else {
    if (restartingResolve) restartingResolve();
    restartingResolve = null;
  }
}

export function setResultCalculating(val: boolean): void {
  resultCalculating = val;
}

export function reset(): void {
  currentTestLine = 0;
  currentWordElementIndex = 0;
}

export function focusWords(): void {
  if (!$("#wordsWrapper").hasClass("hidden")) {
    $("#wordsInput").trigger("focus");
  }
}

export function updateActiveElement(backspace?: boolean): void {
  const active = document.querySelector("#words .active");
  if (Config.mode == "zen" && backspace) {
    active?.remove();
  } else if (active !== null) {
    if (Config.highlightMode == "word") {
      active.querySelectorAll("letter").forEach((e) => {
        e.classList.remove("correct");
      });
    }
    active.classList.remove("active");
  }
  try {
    const activeWord =
      document.querySelectorAll("#words .word")[currentWordElementIndex];
    activeWord.classList.add("active");
    activeWord.classList.remove("error");
    activeWordTop = (<HTMLElement>document.querySelector("#words .active"))
      .offsetTop;
    if (Config.highlightMode == "word") {
      activeWord.querySelectorAll("letter").forEach((e) => {
        e.classList.add("correct");
      });
    }
  } catch (e) {}
}

function getWordHTML(word: string): string {
  let newlineafter = false;
  let retval = `<div class='word'>`;
  const funbox = FunboxList.get(Config.funbox).find(
    (f) => f.functions?.getWordHtml
  );
  for (let c = 0; c < word.length; c++) {
    if (funbox?.functions?.getWordHtml) {
      retval += funbox.functions.getWordHtml(word.charAt(c), true);
    } else if (word.charAt(c) === "\t") {
      retval += `<letter class='tabChar'><i class="fas fa-long-arrow-alt-right"></i></letter>`;
    } else if (word.charAt(c) === "\n") {
      newlineafter = true;
      retval += `<letter class='nlChar'><i class="fas fa-angle-down"></i></letter>`;
    } else {
      retval += "<letter>" + word.charAt(c) + "</letter>";
    }
  }
  retval += "</div>";
  if (newlineafter) retval += "<div class='newline'></div>";
  return retval;
}

export function showWords(): void {
  $("#words").empty();

  if (Config.tapeMode !== "off") {
    $("#words").addClass("tape");
    $("#wordsWrapper").addClass("tape");
  } else {
    $("#words").removeClass("tape");
    $("#wordsWrapper").removeClass("tape");
  }

  if (Config.indicateTypos === "below") {
    $("#words").addClass("indicateTyposBelow");
    $("#wordsWrapper").addClass("indicateTyposBelow");
  } else {
    $("#words").removeClass("indicateTyposBelow");
    $("#wordsWrapper").removeClass("indicateTyposBelow");
  }

  let wordsHTML = "";
  if (Config.mode !== "zen") {
    for (let i = 0; i < TestWords.words.length; i++) {
      wordsHTML += getWordHTML(<string>TestWords.words.get(i));
    }
  } else {
    wordsHTML =
      '<div class="word">word height</div><div class="word active"></div>';
  }

  $("#words").html(wordsHTML);

  updateWordsHeight();
}

export function updateWordsHeight(): void {
  $("#wordsWrapper").removeClass("hidden");
  const wordHeight = <number>(
    $(<Element>document.querySelector(".word")).outerHeight(true)
  );
  const wordsHeight = <number>(
    $(<Element>document.querySelector("#words")).outerHeight(true)
  );
  if (
    Config.showAllLines &&
    Config.mode != "time" &&
    !(CustomText.isWordRandom && CustomText.word == 0) &&
    !CustomText.isTimeRandom
  ) {
    $("#words")
      .css("height", "auto")
      .css("overflow", "hidden")
      .css("width", "100%")
      .css("margin-left", "unset");
    $("#wordsWrapper").css("height", "auto").css("overflow", "hidden");

    let nh = wordHeight * 3;

    if (nh > wordsHeight) {
      nh = wordsHeight;
    }
    $(".outOfFocusWarning").css("line-height", nh + "px");
  } else {
    if (Config.tapeMode !== "off") {
      const wrapperHeight = wordHeight;

      $("#words")
        .css("height", wordHeight * 2 + "px")
        .css("overflow", "hidden")
        .css("width", "200%")
        .css("margin-left", "50%");
      $("#wordsWrapper")
        .css("height", wrapperHeight + "px")
        .css("overflow", "hidden");
      $(".outOfFocusWarning").css("line-height", wrapperHeight + "px");
    } else {
      $("#words")
        .css("height", wordHeight * 4 + "px")
        .css("overflow", "hidden")
        .css("width", "100%")
        .css("margin-left", "unset");
      $("#wordsWrapper")
        .css("height", wordHeight * 3 + "px")
        .css("overflow", "hidden");
      $(".outOfFocusWarning").css("line-height", wordHeight * 3 + "px");
    }
  }

  if (Config.mode === "zen") {
    $(<Element>document.querySelector(".word")).remove();
  }

  updateActiveElement();
  Caret.updatePosition();
}

export function addWord(word: string): void {
  $("#words").append(getWordHTML(word));
}

export function flipColors(tf: boolean): void {
  if (tf) {
    $("#words").addClass("flipped");
  } else {
    $("#words").removeClass("flipped");
  }
}

export function colorful(tc: boolean): void {
  if (tc) {
    $("#words").addClass("colorfulMode");
  } else {
    $("#words").removeClass("colorfulMode");
  }
}

export async function screenshot(): Promise<void> {
  let revealReplay = false;

  let revertCookie = false;
  if (!$("#cookiePopupWrapper").hasClass("hidden")) {
    revertCookie = true;
  }

  function revertScreenshot(): void {
    // $("#testConfig").removeClass("invisible");
    $("#ad-result-wrapper").removeClass("hidden");
    $("#ad-result-small-wrapper").removeClass("hidden");
    $("#notificationCenter").removeClass("hidden");
    $("#commandLineMobileButton").removeClass("hidden");
    $(".pageTest .ssWatermark").addClass("hidden");
    $(".pageTest .ssWatermark").text("monkeytype.com");
    $(".pageTest .buttons").removeClass("hidden");
    $("noscript").removeClass("hidden");
    $("#nocss").removeClass("hidden");
    if (revertCookie) $("#cookiePopupWrapper").removeClass("hidden");
    if (revealReplay) $("#resultReplay").removeClass("hidden");
    if (!Auth?.currentUser) {
      $(".pageTest .loginTip").removeClass("hidden");
    }
  }

  if (!$("#resultReplay").hasClass("hidden")) {
    revealReplay = true;
    Replay.pauseReplay();
  }
  const dateNow = new Date(Date.now());
  $("#resultReplay").addClass("hidden");
  $(".pageTest .ssWatermark").removeClass("hidden");
  $(".pageTest .ssWatermark").text(
    format(dateNow, "dd MMM yyyy HH:mm") + " | monkeytype.com "
  );
  if (Auth?.currentUser) {
    $(".pageTest .ssWatermark").text(
      DB.getSnapshot()?.name +
        " | " +
        format(dateNow, "dd MMM yyyy HH:mm") +
        " | monkeytype.com  "
    );
  }
  $(".pageTest .buttons").addClass("hidden");
  // $("#testConfig").addClass("invisible");
  $("#notificationCenter").addClass("hidden");
  $("#commandLineMobileButton").addClass("hidden");
  $(".pageTest .loginTip").addClass("hidden");
  $("noscript").addClass("hidden");
  $("#nocss").addClass("hidden");
  $("#ad-result-wrapper").addClass("hidden");
  $("#ad-result-small-wrapper").addClass("hidden");
  if (revertCookie) $("#cookiePopupWrapper").addClass("hidden");

  const src = $("#result");
  const sourceX = src.offset()?.left ?? 0; /*X position from div#target*/
  const sourceY = src.offset()?.top ?? 0; /*Y position from div#target*/
  const sourceWidth = <number>(
    src.outerWidth(true)
  ); /*clientWidth/offsetWidth from div#target*/
  const sourceHeight = <number>(
    src.outerHeight(true)
  ); /*clientHeight/offsetHeight from div#target*/
  try {
    const paddingX = Misc.convertRemToPixels(2);
    const paddingY = Misc.convertRemToPixels(2);
    html2canvas(document.body, {
      backgroundColor: await ThemeColors.get("bg"),
      width: sourceWidth + paddingX * 2,
      height: sourceHeight + paddingY * 2,
      x: sourceX - paddingX,
      y: sourceY - paddingY,
    }).then((canvas) => {
      canvas.toBlob((blob) => {
        try {
          if (blob === null) return;
          if (navigator.userAgent.toLowerCase().indexOf("firefox") > -1) {
            open(URL.createObjectURL(blob));
            revertScreenshot();
          } else {
            navigator.clipboard
              .write([
                new ClipboardItem(
                  Object.defineProperty({}, blob.type, {
                    value: blob,
                    enumerable: true,
                  })
                ),
              ])
              .then(() => {
                Notifications.add("Copied to clipboard", 1, 2);
                revertScreenshot();
              })
              .catch((e) => {
                Notifications.add(
                  Misc.createErrorMessage(e, "Error saving image to clipboard"),
                  -1
                );
                revertScreenshot();
              });
          }
        } catch (e) {
          Notifications.add(
            Misc.createErrorMessage(e, "Error saving image to clipboard"),
            -1
          );
          revertScreenshot();
        }
      });
    });
  } catch (e) {
    Notifications.add(Misc.createErrorMessage(e, "Error creating image"), -1);
    revertScreenshot();
  }
  setTimeout(() => {
    revertScreenshot();
  }, 3000);
}

export function updateWordElement(showError = !Config.blindMode): void {
  const input = TestInput.input.current;
  const wordAtIndex = <Element>document.querySelector("#words .word.active");
  const currentWord = TestWords.words.getCurrent();
  if (!currentWord && Config.mode !== "zen") return;
  let ret = "";

  let newlineafter = false;

  if (Config.mode === "zen") {
    for (let i = 0; i < TestInput.input.current.length; i++) {
      if (TestInput.input.current[i] === "\t") {
        ret += `<letter class='tabChar correct' style="opacity: 0"><i class="fas fa-long-arrow-alt-right"></i></letter>`;
      } else if (TestInput.input.current[i] === "\n") {
        newlineafter = true;
        ret += `<letter class='nlChar correct' style="opacity: 0"><i class="fas fa-angle-down"></i></letter>`;
      } else {
        ret += `<letter class="correct">${TestInput.input.current[i]}</letter>`;
      }
    }
  } else {
    let correctSoFar = false;

    const containsKorean = TestInput.input.getKoreanStatus();

    if (!containsKorean) {
      // slice earlier if input has trailing compose characters
      const inputWithoutComposeLength = Misc.trailingComposeChars.test(input)
        ? input.search(Misc.trailingComposeChars)
        : input.length;
      if (
        input.search(Misc.trailingComposeChars) < currentWord.length &&
        currentWord.slice(0, inputWithoutComposeLength) ===
          input.slice(0, inputWithoutComposeLength)
      ) {
        correctSoFar = true;
      }
    } else {
      // slice earlier if input has trailing compose characters
      const koCurrentWord: string = Hangul.disassemble(currentWord).join("");
      const koInput: string = Hangul.disassemble(input).join("");
      const inputWithoutComposeLength: number = Misc.trailingComposeChars.test(
        input
      )
        ? input.search(Misc.trailingComposeChars)
        : koInput.length;
      if (
        input.search(Misc.trailingComposeChars) <
          Hangul.d(koCurrentWord).length &&
        koCurrentWord.slice(0, inputWithoutComposeLength) ===
          koInput.slice(0, inputWithoutComposeLength)
      ) {
        correctSoFar = true;
      }
    }

    let wordHighlightClassString = correctSoFar ? "correct" : "incorrect";

    if (Config.blindMode) {
      wordHighlightClassString = "correct";
    }

    const funbox = FunboxList.get(Config.funbox).find(
      (f) => f.functions?.getWordHtml
    );
    for (let i = 0; i < input.length; i++) {
      const charCorrect = currentWord[i] == input[i];

      let correctClass = "correct";
      if (Config.highlightMode == "off") {
        correctClass = "";
      }

      let currentLetter = currentWord[i];
      let tabChar = "";
      let nlChar = "";
      if (funbox?.functions?.getWordHtml) {
        const cl = funbox.functions.getWordHtml(currentLetter);
        if (cl != "") {
          currentLetter = cl;
        }
      } else if (currentLetter === "\t") {
        tabChar = "tabChar";
        currentLetter = `<i class="fas fa-long-arrow-alt-right"></i>`;
      } else if (currentLetter === "\n") {
        nlChar = "nlChar";
        currentLetter = `<i class="fas fa-angle-down"></i>`;
      }

      if (charCorrect) {
        ret += `<letter class="${
          Config.highlightMode == "word"
            ? wordHighlightClassString
            : correctClass
        } ${tabChar}${nlChar}">${currentLetter}</letter>`;
      } else if (
        currentLetter !== undefined &&
        CompositionState.getComposing() &&
        i >= CompositionState.getStartPos() &&
        !(containsKorean && !correctSoFar)
      ) {
        ret += `<letter class="${
          Config.highlightMode == "word" ? wordHighlightClassString : ""
        } dead">${currentLetter}</letter>`;
      } else if (!showError) {
        if (currentLetter !== undefined) {
          ret += `<letter class="${
            Config.highlightMode == "word"
              ? wordHighlightClassString
              : correctClass
          } ${tabChar}${nlChar}">${currentLetter}</letter>`;
        }
      } else if (currentLetter === undefined) {
        if (!Config.hideExtraLetters) {
          let letter = input[i];
          if (letter == " " || letter == "\t" || letter == "\n") {
            letter = "_";
          }
          ret += `<letter class="${
            Config.highlightMode == "word"
              ? wordHighlightClassString
              : "incorrect"
          } extra ${tabChar}${nlChar}">${letter}</letter>`;
        }
      } else {
        ret +=
          `<letter class="${
            Config.highlightMode == "word"
              ? wordHighlightClassString
              : "incorrect"
          } ${tabChar}${nlChar}">` +
          (Config.indicateTypos === "replace"
            ? input[i] == " "
              ? "_"
              : input[i]
            : currentLetter) +
          (Config.indicateTypos === "below" ? `<hint>${input[i]}</hint>` : "") +
          "</letter>";
      }
    }

    for (let i = input.length; i < currentWord.length; i++) {
      if (funbox?.functions?.getWordHtml) {
        ret += funbox.functions.getWordHtml(currentWord[i], true);
      } else if (currentWord[i] === "\t") {
        ret += `<letter class='tabChar'><i class="fas fa-long-arrow-alt-right"></i></letter>`;
      } else if (currentWord[i] === "\n") {
        ret += `<letter class='nlChar'><i class="fas fa-angle-down"></i></letter>`;
      } else {
        ret +=
          `<letter class="${
            Config.highlightMode == "word" ? wordHighlightClassString : ""
          }">` +
          currentWord[i] +
          "</letter>";
      }
    }

    if (Config.highlightMode === "letter" && Config.hideExtraLetters) {
      if (input.length > currentWord.length && !Config.blindMode) {
        wordAtIndex.classList.add("error");
      } else if (input.length == currentWord.length) {
        wordAtIndex.classList.remove("error");
      }
    }
  }
  wordAtIndex.innerHTML = ret;
  if (newlineafter) $("#words").append("<div class='newline'></div>");
}

export function scrollTape(): void {
  const wordsWrapperWidth = (<HTMLElement>(
    document.querySelector("#wordsWrapper")
  )).offsetWidth;
  let fullWordsWidth = 0;
  const toHide: JQuery<HTMLElement>[] = [];
  let widthToHide = 0;
  if (currentWordElementIndex > 0) {
    for (let i = 0; i < currentWordElementIndex; i++) {
      const word = <HTMLElement>document.querySelectorAll("#words .word")[i];
      fullWordsWidth += $(word).outerWidth(true) ?? 0;
      const forWordLeft = Math.floor(word.offsetLeft);
      const forWordWidth = Math.floor(word.offsetWidth);
      if (forWordLeft < 0 - forWordWidth) {
        const toPush = $($("#words .word")[i]);
        toHide.push(toPush);
        widthToHide += toPush.outerWidth(true) ?? 0;
      }
    }
    if (toHide.length > 0) {
      currentWordElementIndex -= toHide.length;
      toHide.forEach((e) => e.remove());
      fullWordsWidth -= widthToHide;
      const currentMargin = parseInt($("#words").css("margin-left"), 10);
      $("#words").css("margin-left", `${currentMargin + widthToHide}px`);
    }
  }
  let currentWordWidth = 0;
  if (Config.tapeMode === "letter") {
    if (TestInput.input.current.length > 0) {
      for (let i = 0; i < TestInput.input.current.length; i++) {
        const words = document.querySelectorAll("#words .word");
        currentWordWidth +=
          $(
            words[currentWordElementIndex].querySelectorAll("letter")[i]
          ).outerWidth(true) ?? 0;
      }
    }
  }
  const newMargin = wordsWrapperWidth / 2 - (fullWordsWidth + currentWordWidth);
  if (Config.smoothLineScroll) {
    $("#words")
      .stop(true, false)
      .animate(
        {
          marginLeft: newMargin,
        },
        SlowTimer.get() ? 0 : 125
      );
  } else {
    $("#words").css("margin-left", `${newMargin}px`);
  }
}

let currentLinesAnimating = 0;

export function lineJump(currentTop: number): void {
  //last word of the line
  if (
    (Config.tapeMode === "off" && currentTestLine > 0) ||
    (Config.tapeMode !== "off" && currentTestLine >= 0)
  ) {
    const hideBound = currentTop;

    const toHide: JQuery<HTMLElement>[] = [];
    const wordElements = $("#words .word");
    for (let i = 0; i < currentWordElementIndex; i++) {
      if ($(wordElements[i]).hasClass("hidden")) continue;
      const forWordTop = Math.floor(wordElements[i].offsetTop);
      if (
        forWordTop <
        (Config.tapeMode === "off" ? hideBound - 10 : hideBound + 10)
      ) {
        toHide.push($($("#words .word")[i]));
      }
    }
    const wordHeight = <number>(
      $(<Element>document.querySelector(".word")).outerHeight(true)
    );
    if (Config.smoothLineScroll && toHide.length > 0) {
      lineTransition = true;
      const smoothScroller = $("#words .smoothScroller");
      if (smoothScroller.length === 0) {
        $("#words").prepend(
          `<div class="smoothScroller" style="position: fixed;height:${wordHeight}px;width:100%"></div>`
        );
      } else {
        smoothScroller.css(
          "height",
          `${(smoothScroller.outerHeight(true) ?? 0) + wordHeight}px`
        );
      }
      $("#words .smoothScroller")
        .stop(true, false)
        .animate(
          {
            height: 0,
          },
          SlowTimer.get() ? 0 : 125,
          () => {
            $("#words .smoothScroller").remove();
          }
        );
      $("#paceCaret")
        .stop(true, false)
        .animate(
          {
            top:
              (<HTMLElement>document.querySelector("#paceCaret"))?.offsetTop -
              wordHeight,
          },
          SlowTimer.get() ? 0 : 125
        );

      const newCss: { [key: string]: string } = {
        marginTop: `-${wordHeight * (currentLinesAnimating + 1)}px`,
      };

      if (Config.tapeMode !== "off") {
        const wordsWrapperWidth = (<HTMLElement>(
          document.querySelector("#wordsWrapper")
        )).offsetWidth;
        const newMargin = wordsWrapperWidth / 2;
        newCss["marginLeft"] = `${newMargin}px`;
      }
      currentLinesAnimating++;
      $("#words")
        .stop(true, false)
        .animate(newCss, SlowTimer.get() ? 0 : 125, () => {
          currentLinesAnimating = 0;
          activeWordTop = (<HTMLElement>(
            document.querySelector("#words .active")
          )).offsetTop;

          currentWordElementIndex -= toHide.length;
          lineTransition = false;
          toHide.forEach((el) => el.remove());
          $("#words").css("marginTop", "0");
        });
    } else {
      toHide.forEach((el) => el.remove());
      currentWordElementIndex -= toHide.length;
      $("#paceCaret").css({
        top:
          (<HTMLElement>document.querySelector("#paceCaret")).offsetTop -
          wordHeight,
      });
    }
  }
  currentTestLine++;
}

export function arrangeCharactersRightToLeft(): void {
  $("#words").addClass("rightToLeftTest");
  $("#resultWordsHistory .words").addClass("rightToLeftTest");
  $("#resultReplay .words").addClass("rightToLeftTest");
}

export function arrangeCharactersLeftToRight(): void {
  $("#words").removeClass("rightToLeftTest");
  $("#resultWordsHistory .words").removeClass("rightToLeftTest");
  $("#resultReplay .words").removeClass("rightToLeftTest");
}

async function loadWordsHistory(): Promise<boolean> {
  $("#resultWordsHistory .words").empty();
  let wordsHTML = "";
  for (let i = 0; i < TestInput.input.history.length + 2; i++) {
    const input = <string>TestInput.input.getHistory(i);
    const word = TestWords.words.get(i);
    const containsKorean =
      input?.match(
        /[\uac00-\ud7af]|[\u1100-\u11ff]|[\u3130-\u318f]|[\ua960-\ua97f]|[\ud7b0-\ud7ff]/g
      ) ||
      word?.match(
        /[\uac00-\ud7af]|[\u1100-\u11ff]|[\u3130-\u318f]|[\ua960-\ua97f]|[\ud7b0-\ud7ff]/g
      );
    let wordEl = "";
    try {
      if (input === "") throw new Error("empty input word");
      if (
        TestInput.corrected.getHistory(i) !== undefined &&
        TestInput.corrected.getHistory(i) !== ""
      ) {
        const correctedChar = !containsKorean
          ? TestInput.corrected.getHistory(i)
          : Hangul.assemble(TestInput.corrected.getHistory(i).split(""));
        wordEl = `<div class='word' burst="${
          TestInput.burstHistory[i]
        }" input="${correctedChar
          .replace(/"/g, "&quot;")
          .replace(/ /g, "_")}">`;
      } else {
        wordEl = `<div class='word' burst="${
          TestInput.burstHistory[i]
        }" input="${input.replace(/"/g, "&quot;").replace(/ /g, "_")}">`;
      }
      if (i === TestInput.input.history.length - 1) {
        //last word
        const wordstats = {
          correct: 0,
          incorrect: 0,
          missed: 0,
        };
        const length = Config.mode == "zen" ? input.length : word.length;
        for (let c = 0; c < length; c++) {
          if (c < input.length) {
            //on char that still has a word list pair
            if (Config.mode == "zen" || input[c] == word[c]) {
              wordstats.correct++;
            } else {
              wordstats.incorrect++;
            }
          } else {
            //on char that is extra
            wordstats.missed++;
          }
        }
        if (wordstats.incorrect !== 0 || Config.mode !== "time") {
          if (Config.mode != "zen" && input !== word) {
            wordEl = `<div class='word error' burst="${
              TestInput.burstHistory[i]
            }" input="${input.replace(/"/g, "&quot;").replace(/ /g, "_")}">`;
          }
        }
      } else {
        if (Config.mode != "zen" && input !== word) {
          wordEl = `<div class='word error' burst="${
            TestInput.burstHistory[i]
          }" input="${input.replace(/"/g, "&quot;").replace(/ /g, "_")}">`;
        }
      }

      let loop;
      if (Config.mode == "zen" || input.length > word.length) {
        //input is longer - extra characters possible (loop over input)
        loop = input.length;
      } else {
        //input is shorter or equal (loop over word list)
        loop = word.length;
      }
      for (let c = 0; c < loop; c++) {
        let correctedChar;
        try {
          correctedChar = !containsKorean
            ? TestInput.corrected.getHistory(i)[c]
            : Hangul.assemble(TestInput.corrected.getHistory(i).split(""))[c];
        } catch (e) {
          correctedChar = undefined;
        }
        let extraCorrected = "";
        const historyWord: string = !containsKorean
          ? TestInput.corrected.getHistory(i)
          : Hangul.assemble(TestInput.corrected.getHistory(i).split(""));
        if (
          c + 1 === loop &&
          historyWord !== undefined &&
          historyWord.length > input.length
        ) {
          extraCorrected = "extraCorrected";
        }
        if (Config.mode == "zen" || word[c] !== undefined) {
          if (Config.mode == "zen" || input[c] === word[c]) {
            if (correctedChar === input[c] || correctedChar === undefined) {
              wordEl += `<letter class="correct ${extraCorrected}">${input[c]}</letter>`;
            } else {
              wordEl +=
                `<letter class="corrected ${extraCorrected}">` +
                input[c] +
                "</letter>";
            }
          } else {
            if (input[c] === TestInput.input.current) {
              wordEl +=
                `<letter class='correct ${extraCorrected}'>` +
                word[c] +
                "</letter>";
            } else if (input[c] === undefined) {
              wordEl += "<letter>" + word[c] + "</letter>";
            } else {
              wordEl +=
                `<letter class="incorrect ${extraCorrected}">` +
                word[c] +
                "</letter>";
            }
          }
        } else {
          wordEl += '<letter class="incorrect extra">' + input[c] + "</letter>";
        }
      }
      wordEl += "</div>";
    } catch (e) {
      try {
        wordEl = "<div class='word'>";
        for (let c = 0; c < word.length; c++) {
          wordEl += "<letter>" + word[c] + "</letter>";
        }
        wordEl += "</div>";
      } catch {}
    }
    wordsHTML += wordEl;
  }
  $("#resultWordsHistory .words").html(wordsHTML);
  $("#showWordHistoryButton").addClass("loaded");
  return true;
}

export function toggleResultWords(): void {
  if (resultVisible) {
    if ($("#resultWordsHistory").stop(true, true).hasClass("hidden")) {
      //show

      if (!$("#showWordHistoryButton").hasClass("loaded")) {
        $("#words").html(
          `<div class="preloader"><i class="fas fa-fw fa-spin fa-circle-notch"></i></div>`
        );
        loadWordsHistory().then(() => {
          if (Config.burstHeatmap) {
            applyBurstHeatmap();
          }
          $("#resultWordsHistory")
            .removeClass("hidden")
            .css("display", "none")
            .slideDown(250, () => {
              if (Config.burstHeatmap) {
                applyBurstHeatmap();
              }
            });
        });
      } else {
        if (Config.burstHeatmap) {
          applyBurstHeatmap();
        }
        $("#resultWordsHistory")
          .removeClass("hidden")
          .css("display", "none")
          .slideDown(250);
      }
    } else {
      //hide

      $("#resultWordsHistory").slideUp(250, () => {
        $("#resultWordsHistory").addClass("hidden");
      });
    }
  }
}

export function applyBurstHeatmap(): void {
  if (Config.burstHeatmap) {
    $("#resultWordsHistory .heatmapLegend").removeClass("hidden");

    let burstlist = [...TestInput.burstHistory];

    burstlist = burstlist.filter((x) => x !== Infinity);
    burstlist = burstlist.filter((x) => x < 350);

    if (
      TestInput.input.getHistory(TestInput.input.getHistory().length - 1)
        ?.length !== TestWords.words.getCurrent()?.length
    ) {
      burstlist = burstlist.splice(0, burstlist.length - 1);
    }

    const median = Misc.median(burstlist);
    const adatm: number[] = [];
    burstlist.forEach((burst) => {
      adatm.push(Math.abs(median - burst));
    });
    const step = Misc.mean(adatm);
    const steps = [
      {
        val: 0,
        class: "heatmap0",
      },
      {
        val: median - step * 1.5,
        class: "heatmap1",
      },
      {
        val: median - step * 0.5,
        class: "heatmap2",
      },
      {
        val: median + step * 0.5,
        class: "heatmap3",
      },
      {
        val: median + step * 1.5,
        class: "heatmap4",
      },
    ];

    steps.forEach((step, index) => {
      let string = "";
      if (index === 0) {
        string = `<${Math.round(steps[index + 1].val)}`;
      } else if (index === 4) {
        string = `${Math.round(step.val - 1)}+`;
      } else {
        string = `${Math.round(step.val)}-${
          Math.round(steps[index + 1].val) - 1
        }`;
      }

      $("#resultWordsHistory .heatmapLegend .box" + index).html(
        `<div>${string}</div>`
      );
    });

    $("#resultWordsHistory .words .word").each((_, word) => {
      let cls = "";
      const wordBurstAttr = $(word).attr("burst");
      if (wordBurstAttr === undefined) {
        cls = "unreached";
      } else {
        const wordBurstVal = parseInt(<string>wordBurstAttr);
        steps.forEach((step) => {
          if (wordBurstVal >= step.val) cls = step.class;
        });
      }
      $(word).addClass(cls);
    });
  } else {
    $("#resultWordsHistory .heatmapLegend").addClass("hidden");
    $("#resultWordsHistory .words .word").removeClass("heatmap0");
    $("#resultWordsHistory .words .word").removeClass("heatmap1");
    $("#resultWordsHistory .words .word").removeClass("heatmap2");
    $("#resultWordsHistory .words .word").removeClass("heatmap3");
    $("#resultWordsHistory .words .word").removeClass("heatmap4");
    $("#resultWordsHistory .words .word").removeClass("unreached");
  }
}

export function highlightBadWord(index: number, showError: boolean): void {
  if (!showError) return;
  $($("#words .word")[index]).addClass("error");
}

$(".pageTest").on("click", "#saveScreenshotButton", () => {
  screenshot();
});

$("#saveScreenshotButton").on("keypress", (e) => {
  if (e.key === "Enter") {
    screenshot();
  }
});

$(".pageTest #copyWordsListButton").on("click", async () => {
  try {
    let words;
    if (Config.mode == "zen") {
      words = TestInput.input.history.join(" ");
    } else {
      words = (<string[]>TestWords.words.get())
        .slice(0, TestInput.input.history.length)
        .join(" ");
    }
    await navigator.clipboard.writeText(words);
    Notifications.add("Copied to clipboard", 0, 2);
  } catch (e) {
    Notifications.add("Could not copy to clipboard: " + e, -1);
  }
});

$(".pageTest #toggleBurstHeatmap").on("click", async () => {
  UpdateConfig.setBurstHeatmap(!Config.burstHeatmap);
});

$(".pageTest #resultWordsHistory").on("mouseleave", ".words .word", () => {
  $(".wordInputAfter").remove();
});

$(".pageTest #result #wpmChart").on("mouseleave", () => {
  $(".wordInputAfter").remove();
});

$(".pageTest #resultWordsHistory").on("mouseenter", ".words .word", (e) => {
  if (resultVisible) {
    const input = $(e.currentTarget).attr("input");
    const burst = parseInt(<string>$(e.currentTarget).attr("burst"));
    if (input != undefined) {
      $(e.currentTarget).append(
        `<div class="wordInputAfter">
          <div class="text">
          ${input
            .replace(/\t/g, "_")
            .replace(/\n/g, "_")
            .replace(/</g, "&lt")
            .replace(/>/g, "&gt")}
          </div>
          <div class="speed">
          ${Math.round(Config.alwaysShowCPM ? burst * 5 : burst)}${
          Config.alwaysShowCPM ? "cpm" : "wpm"
        }
          </div>
          </div>`
      );
    }
  }
});

$("#wordsInput").on("focus", () => {
  if (!resultVisible && Config.showOutOfFocusWarning) {
    OutOfFocus.hide();
  }
  Caret.show();
});

$("#wordsInput").on("focusout", () => {
  if (!resultVisible && Config.showOutOfFocusWarning) {
    OutOfFocus.show();
  }
  Caret.hide();
});

$(document).on("keypress", "#showWordHistoryButton", (event) => {
  if (event.key === "Enter") {
    toggleResultWords();
  }
});

$(".pageTest").on("click", "#showWordHistoryButton", () => {
  toggleResultWords();
});

$("#wordsWrapper").on("click", () => {
  focusWords();
});

$(document).on("keypress", () => {
  if (resultVisible) {
    skipXpBreakdown();
  }
});
