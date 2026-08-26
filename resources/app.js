import { createQuestionnaires } from "./questionnaire.js";

const ANSWERS_STORAGE_KEY = "questionnaire.savedAnswers";

const state = {
    questionnaires: [],
    activeQuestionnaire: null,
};

const elements = {
    questionnaireSelect: document.querySelector("#questionnaireSelect"),
    questionnaireSummary: document.querySelector("#questionnaireSummary"),
    questionnaireMount: document.querySelector("#questionnaireMount"),
    statusMessage: document.querySelector("#statusMessage"),
    resultCard: document.querySelector("#resultCard"),
    resultTag: document.querySelector("#resultTag"),
    resultTitle: document.querySelector("#resultTitle"),
    resultScore: document.querySelector("#resultScore"),
    resultMeter: document.querySelector("#resultMeter"),
    resultInterpretation: document.querySelector("#resultInterpretation"),
    resultDetails: document.querySelector("#resultDetails"),
};

const mobileScrollBackState = {
    button: null,
    mediaQuery: window.matchMedia("(max-width: 900px)"),
    firstQuestion: null,
    scrollHandler: null,
};

init();

async function init() {
    setStatus("Γίνεται φόρτωση των ερωτηματολογίων...", "info");

    try {
        const response = await fetch(new URL("./questionnaire.json", import.meta.url), { cache: "no-store" });

        if (!response.ok) {
            throw new Error("Δεν ήταν δυνατή η φόρτωση του questionnaire.json.");
        }

        const payload = await response.json();
        state.questionnaires = createQuestionnaires(payload.questionnaires);

        if (state.questionnaires.length === 0) {
            throw new Error("Δεν βρέθηκαν διαθέσιμα ερωτηματολόγια.");
        }

        populateQuestionnaireSelect();
        attachGlobalListeners();

        state.activeQuestionnaire = state.questionnaires[0];
        elements.questionnaireSelect.value = state.activeQuestionnaire.id;
        const renderResult = renderActiveQuestionnaire();
        setRestoreStatus(renderResult);
    } catch (error) {
        renderLoadError(error);
        setStatus(error instanceof Error ? error.message : "Προέκυψε σφάλμα κατά τη φόρτωση.", "error");
    }
}

function attachGlobalListeners() {
    elements.questionnaireSelect.addEventListener("change", (event) => {
        const nextQuestionnaire = state.questionnaires.find(
            (questionnaire) => questionnaire.id === event.target.value,
        );

        if (!nextQuestionnaire) {
            return;
        }

        state.activeQuestionnaire = nextQuestionnaire;
        const renderResult = renderActiveQuestionnaire();
        hideResult();
        setRestoreStatus(renderResult);
    });

    mobileScrollBackState.mediaQuery.addEventListener("change", syncMobileScrollBackButton);
}

function populateQuestionnaireSelect() {
    elements.questionnaireSelect.replaceChildren();

    for (const questionnaire of state.questionnaires) {
        const option = document.createElement("option");
        option.value = questionnaire.id;
        option.textContent = questionnaire.title;
        elements.questionnaireSelect.append(option);
    }

    elements.questionnaireSelect.disabled = false;
}

function renderActiveQuestionnaire() {
    const questionnaire = state.activeQuestionnaire;

    if (!questionnaire) {
        return null;
    }

    updateSummary(questionnaire);
    hideResult();
    elements.questionnaireMount.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "questionnaire-flow";

    const head = document.createElement("div");
    head.className = "questionnaire-head";

    const kicker = document.createElement("p");
    kicker.className = "section-kicker";
    kicker.textContent = "Βήμα 2";

    const title = document.createElement("h2");
    title.textContent = questionnaire.title;

    const description = document.createElement("p");
    description.textContent = questionnaire.description || "Απάντησε με ειλικρίνεια για να δεις μια πρώτη ένδειξη.";

    head.append(kicker, title, description);

    const form = document.createElement("form");
    form.className = "questionnaire-form";
    form.noValidate = true;

    const progressRow = document.createElement("div");
    progressRow.className = "progress-row";

    const progressText = document.createElement("p");
    progressText.className = "progress-text";

    const progressHint = document.createElement("p");
    progressHint.className = "progress-hint";
    progressHint.textContent = "Διάλεξε μία απάντηση για κάθε ερώτηση.";

    progressRow.append(progressText, progressHint);
    form.append(progressRow);

    questionnaire.questions.forEach((question, index) => {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "question-card";
        fieldset.style.setProperty("--delay", `${index * 70}ms`);

        const legend = document.createElement("legend");
        legend.textContent = `${index + 1}. ${question.text}`;
        fieldset.append(legend);

        const answersGrid = document.createElement("div");
        answersGrid.className = "answer-grid";

        question.answers.forEach((answer) => {
            const label = document.createElement("label");
            label.className = "answer-option";

            const input = document.createElement("input");
            input.type = "radio";
            input.name = question.id;
            input.value = String(answer.value);

            const descriptionText = document.createElement("span");
            descriptionText.className = "answer-description";
            descriptionText.textContent = answer.description;

            const valueBadge = document.createElement("span");
            valueBadge.className = "answer-value";
            valueBadge.textContent = `${answer.value}`;

            label.append(input, descriptionText, valueBadge);
            answersGrid.append(label);
        });

        fieldset.append(answersGrid);
        form.append(fieldset);
    });

    const actions = document.createElement("div");
    actions.className = "form-actions";

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "button button-primary mt-3";
    submitButton.textContent = "Υπολογισμός αποτελέσματος";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "button button-secondary";
    resetButton.textContent = "Καθαρισμός απαντήσεων";
    resetButton.addEventListener("click", () => {
        clearQuestionnaireAnswers(form, questionnaire, progressText);
    });

    actions.append(submitButton, resetButton);
    form.append(actions);

    form.addEventListener("change", () => {
        updateProgress(form, questionnaire, progressText);
        hideResult();

        if (elements.statusMessage.dataset.tone === "error") {
            setStatus("", "info");
        }
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        handleFormSubmit(form, questionnaire, progressText);
    });

    const restoredAnswerCount = restoreSavedAnswers(form, questionnaire);
    updateProgress(form, questionnaire, progressText);
    wrapper.append(head, form);
    elements.questionnaireMount.append(wrapper);
    syncMobileScrollBackButton();
    return {
        form,
        progressText,
        questionnaire,
        restoredAnswerCount,
    };
}

function syncMobileScrollBackButton() {
    const isMobileViewport = mobileScrollBackState.mediaQuery.matches;

    if (!isMobileViewport) {
        detachScrollBackTracking();
        hideScrollBackButton();
        return;
    }

    const firstQuestion = elements.questionnaireMount.querySelector(".question-card");

    if (!firstQuestion) {
        detachScrollBackTracking();
        hideScrollBackButton();
        return;
    }

    const button = ensureScrollBackButton();
    mobileScrollBackState.firstQuestion = firstQuestion;

    if (!mobileScrollBackState.scrollHandler) {
        mobileScrollBackState.scrollHandler = () => {
            updateScrollBackButtonVisibility();
        };
        window.addEventListener("scroll", mobileScrollBackState.scrollHandler, { passive: true });
        window.addEventListener("resize", mobileScrollBackState.scrollHandler);
    }

    updateScrollBackButtonVisibility(button);
}

function ensureScrollBackButton() {
    if (mobileScrollBackState.button) {
        return mobileScrollBackState.button;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "scroll-back-button";
    button.hidden = true;
    button.setAttribute("aria-label", "Επιστροφή στην επιλογή ερωτηματολογίου");
    button.title = "Επιστροφή στην επιλογή ερωτηματολογίου";
    button.innerHTML = [
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
        '<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" />',
        "</svg>",
    ].join("");
    button.addEventListener("click", () => {
        elements.questionnaireSelect.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => elements.questionnaireSelect.focus({ preventScroll: true }), 280);
    });

    document.body.append(button);
    mobileScrollBackState.button = button;
    return button;
}

function hideScrollBackButton() {
    if (!mobileScrollBackState.button) {
        return;
    }

    mobileScrollBackState.button.hidden = true;
    mobileScrollBackState.button.classList.remove("is-visible");
}

function updateScrollBackButtonVisibility(button = mobileScrollBackState.button) {
    if (!button || !mobileScrollBackState.firstQuestion || !mobileScrollBackState.mediaQuery.matches) {
        hideScrollBackButton();
        return;
    }

    const firstQuestionTop = mobileScrollBackState.firstQuestion.getBoundingClientRect().top + window.scrollY;
    const revealOffset = window.innerHeight * 0.22;
    const shouldShow = window.scrollY >= firstQuestionTop - revealOffset;

    button.classList.toggle("is-visible", shouldShow);
    button.hidden = !shouldShow;
}

function detachScrollBackTracking() {
    if (mobileScrollBackState.scrollHandler) {
        window.removeEventListener("scroll", mobileScrollBackState.scrollHandler);
        window.removeEventListener("resize", mobileScrollBackState.scrollHandler);
        mobileScrollBackState.scrollHandler = null;
    }

    mobileScrollBackState.firstQuestion = null;
}

function handleFormSubmit(form, questionnaire, progressText) {
    const selectedAnswers = getSelectedAnswers(form, questionnaire);
    const missingQuestionIds = getMissingQuestionIds(form, questionnaire);
    saveStoredAnswers(questionnaire.id, selectedAnswers);
    updateProgress(form, questionnaire, progressText);

    if (missingQuestionIds.length > 0) {
        const firstMissingInput = form.querySelector(`[name="${missingQuestionIds[0]}"]`);

        setStatus(
            missingQuestionIds.length === 1
                ? "Απάντησε πρώτα και στην τελευταία ερώτηση."
                : `Απάντησε πρώτα σε όλες τις ερωτήσεις. Εκκρεμούν ${missingQuestionIds.length}.`,
            "error",
        );

        firstMissingInput?.focus();
        hideResult();
        return;
    }

    try {
        const result = questionnaire.evaluate(selectedAnswers);
        presentResult(questionnaire, result);
        setStatus("Το αποτέλεσμα υπολογίστηκε παρακάτω.", "success");
    } catch (error) {
        hideResult();
        setStatus(error instanceof Error ? error.message : "Προέκυψε σφάλμα κατά τον υπολογισμό.", "error");
    }
}

function getMissingQuestionIds(form, questionnaire) {
    const formData = new FormData(form);

    return questionnaire.questions
        .filter((question) => formData.get(question.id) === null)
        .map((question) => question.id);
}

function getSelectedAnswers(form, questionnaire) {
    const formData = new FormData(form);

    return Object.fromEntries(
        questionnaire.questions
            .map((question) => {
                const rawValue = formData.get(question.id);

                if (rawValue === null) {
                    return null;
                }

                return [question.id, Number(rawValue)];
            })
            .filter((entry) => entry !== null),
    );
}

function updateProgress(form, questionnaire, progressText) {
    const answeredCount = questionnaire.questions.length - getMissingQuestionIds(form, questionnaire).length;
    progressText.textContent = answeredCount === questionnaire.questions.length
        ? `Όλες οι απαντήσεις συμπληρώθηκαν (${answeredCount}/${questionnaire.questions.length}).`
        : `Απαντήθηκαν ${answeredCount} από ${questionnaire.questions.length} ερωτήσεις.`;
}

function restoreSavedAnswers(form, questionnaire) {
    const savedAnswers = getStoredAnswers(questionnaire.id);
    let restoredAnswerCount = 0;

    questionnaire.questions.forEach((question) => {
        const savedValue = savedAnswers[question.id];

        if (!question.hasValue(Number(savedValue))) {
            return;
        }

        const matchingInput = form.querySelector(
            `input[name="${question.id}"][value="${String(savedValue)}"]`,
        );

        if (!matchingInput) {
            return;
        }

        matchingInput.checked = true;
        restoredAnswerCount += 1;
    });

    return restoredAnswerCount;
}

function clearQuestionnaireAnswers(form, questionnaire, progressText) {
    form.reset();
    clearStoredAnswers(questionnaire.id);
    updateProgress(form, questionnaire, progressText);
    hideResult();
    setStatus("Οι απαντήσεις καθαρίστηκαν.", "info");
}

function getStoredAnswers(questionnaireId) {
    const storedAnswersByQuestionnaire = getAllStoredAnswers();
    const storedAnswers = storedAnswersByQuestionnaire[questionnaireId];

    return storedAnswers && typeof storedAnswers === "object" ? storedAnswers : {};
}

function saveStoredAnswers(questionnaireId, answersByQuestionId) {
    const storedAnswersByQuestionnaire = getAllStoredAnswers();
    storedAnswersByQuestionnaire[questionnaireId] = answersByQuestionId;

    persistStoredAnswers(storedAnswersByQuestionnaire);
}

function clearStoredAnswers(questionnaireId) {
    const storedAnswersByQuestionnaire = getAllStoredAnswers();

    if (!(questionnaireId in storedAnswersByQuestionnaire)) {
        return;
    }

    delete storedAnswersByQuestionnaire[questionnaireId];
    persistStoredAnswers(storedAnswersByQuestionnaire);
}

function getAllStoredAnswers() {
    try {
        const rawValue = window.sessionStorage.getItem(ANSWERS_STORAGE_KEY);

        if (!rawValue) {
            return {};
        }

        const parsedValue = JSON.parse(rawValue);
        return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
    } catch {
        return {};
    }
}

function persistStoredAnswers(storedAnswersByQuestionnaire) {
    try {
        if (Object.keys(storedAnswersByQuestionnaire).length === 0) {
            window.sessionStorage.removeItem(ANSWERS_STORAGE_KEY);
            return;
        }

        window.sessionStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(storedAnswersByQuestionnaire));
    } catch {
        // Ignore storage failures so the questionnaire remains usable.
    }
}

function setRestoreStatus(renderResult) {
    if (renderResult?.restoredAnswerCount > 0) {
        const message = document.createElement("span");
        message.textContent = `Ανακτήθηκαν ${renderResult.restoredAnswerCount} αποθηκευμένες απαντήσεις από την τρέχουσα συνεδρία.`;

        const clearButton = document.createElement("button");
        clearButton.type = "button";
        clearButton.className = "button button-secondary status-message-action";
        clearButton.textContent = "Καθαρισμός απαντήσεων";
        clearButton.addEventListener("click", () => {
            clearQuestionnaireAnswers(renderResult.form, renderResult.questionnaire, renderResult.progressText);
        });

        setStatusContent([message, clearButton], "info");
        return;
    }

    setStatus("", "info");
}

function updateSummary(questionnaire) {
    elements.questionnaireSummary.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = questionnaire.title;

    const description = document.createElement("p");
    description.textContent = questionnaire.description;

    const stats = document.createElement("p");
    stats.className = "summary-stats";
    stats.textContent = `${questionnaire.questions.length} ερωτήσεις • αποτέλεσμα 0-100`;

    elements.questionnaireSummary.append(title, description, stats);
}

function presentResult(questionnaire, result) {
    elements.resultCard.classList.remove("is-hidden");
    elements.resultCard.dataset.tone = result.interpretation.tone;
    elements.resultTag.textContent = `Βήμα 3 • Αποτέλεσμα για ${questionnaire.title}`;
    elements.resultTitle.textContent = result.interpretation.label;
    elements.resultScore.textContent = `${result.normalizedScore}/100`;
    elements.resultMeter.style.width = `${result.normalizedScore}%`;
    elements.resultInterpretation.textContent = result.interpretation.summary;
    elements.resultDetails.textContent = `Ακατέργαστο σκορ: ${result.rawScore} σε διαθέσιμο εύρος ${result.minScore}-${result.maxScore}.`;
    elements.resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideResult() {
    elements.resultCard.classList.add("is-hidden");
}

function renderLoadError(error) {
    elements.questionnaireMount.replaceChildren();
    hideResult();
    elements.questionnaireSelect.disabled = true;

    const errorState = document.createElement("div");
    errorState.className = "empty-state";

    const title = document.createElement("h2");
    title.textContent = "Δεν ήταν δυνατή η φόρτωση";

    const description = document.createElement("p");
    description.textContent = error instanceof Error
        ? error.message
        : "Ελέγξτε ότι η σελίδα ανοίγει μέσω local server και ότι υπάρχει έγκυρο questionnaire.json.";

    errorState.append(title, description);
    elements.questionnaireMount.append(errorState);
}

function setStatus(message, tone = "info") {
    if (!message) {
        elements.statusMessage.hidden = true;
        elements.statusMessage.replaceChildren();
        delete elements.statusMessage.dataset.tone;
        return;
    }

    setStatusContent([document.createTextNode(message)], tone);
}

function setStatusContent(contentNodes, tone = "info") {
    elements.statusMessage.hidden = false;
    elements.statusMessage.dataset.tone = tone;
    elements.statusMessage.replaceChildren(...contentNodes);
}