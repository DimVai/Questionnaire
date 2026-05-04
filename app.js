import { createQuestionnaires } from "./questionnaire.js";

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

init();

async function init() {
    setStatus("Γίνεται φόρτωση των ερωτηματολογίων...", "info");

    try {
        const response = await fetch("./questionnaire.json", { cache: "no-store" });

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
        renderActiveQuestionnaire();
        setStatus("", "info");
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
        renderActiveQuestionnaire();
        hideResult();
        setStatus("", "info");
    });
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
        return;
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
    submitButton.className = "button button-primary";
    submitButton.textContent = "Υπολογισμός αποτελέσματος";

    const resetButton = document.createElement("button");
    resetButton.type = "reset";
    resetButton.className = "button button-secondary";
    resetButton.textContent = "Καθαρισμός απαντήσεων";

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

    form.addEventListener("reset", () => {
        window.requestAnimationFrame(() => {
            updateProgress(form, questionnaire, progressText);
            hideResult();
            setStatus("Οι απαντήσεις καθαρίστηκαν.", "info");
        });
    });

    updateProgress(form, questionnaire, progressText);
    wrapper.append(head, form);
    elements.questionnaireMount.append(wrapper);
}

function handleFormSubmit(form, questionnaire, progressText) {
    const missingQuestionIds = getMissingQuestionIds(form, questionnaire);
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

    const formData = new FormData(form);
    const answersByQuestionId = Object.fromEntries(
        questionnaire.questions.map((question) => [question.id, Number(formData.get(question.id))]),
    );

    try {
        const result = questionnaire.evaluate(answersByQuestionId);
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

function updateProgress(form, questionnaire, progressText) {
    const answeredCount = questionnaire.questions.length - getMissingQuestionIds(form, questionnaire).length;
    progressText.textContent = answeredCount === questionnaire.questions.length
        ? `Όλες οι απαντήσεις συμπληρώθηκαν (${answeredCount}/${questionnaire.questions.length}).`
        : `Απαντήθηκαν ${answeredCount} από ${questionnaire.questions.length} ερωτήσεις.`;
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
        elements.statusMessage.textContent = "";
        delete elements.statusMessage.dataset.tone;
        return;
    }

    elements.statusMessage.hidden = false;
    elements.statusMessage.dataset.tone = tone;
    elements.statusMessage.textContent = message;
}