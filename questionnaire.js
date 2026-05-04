const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class Question {
    constructor({ id, text, answers }) {
        if (typeof id !== "string" || id.trim() === "") {
            throw new Error("Κάθε ερώτηση χρειάζεται έγκυρο id.");
        }

        if (typeof text !== "string" || text.trim() === "") {
            throw new Error("Κάθε ερώτηση χρειάζεται κείμενο.");
        }

        if (!Array.isArray(answers) || answers.length < 2) {
            throw new Error(`Η ερώτηση "${text}" χρειάζεται τουλάχιστον δύο απαντήσεις.`);
        }

        this.id = id;
        this.text = text.trim();
        this.answers = answers.map((answer, index) => {
            const numericValue = Number(answer?.value);
            const description = typeof answer?.description === "string"
                ? answer.description.trim()
                : "";

            if (!Number.isFinite(numericValue)) {
                throw new Error(`Η ερώτηση "${text}" έχει απάντηση με μη αριθμητική τιμή.`);
            }

            if (!description) {
                throw new Error(`Η ερώτηση "${text}" έχει απάντηση χωρίς περιγραφή.`);
            }

            return {
                id: `${id}-answer-${index + 1}`,
                value: numericValue,
                description,
            };
        });
    }

    getMinValue() {
        return this.answers.reduce((currentMin, answer) => Math.min(currentMin, answer.value), this.answers[0].value);
    }

    getMaxValue() {
        return this.answers.reduce((currentMax, answer) => Math.max(currentMax, answer.value), this.answers[0].value);
    }

    hasValue(candidateValue) {
        return this.answers.some((answer) => answer.value === candidateValue);
    }
}

export class Questionnaire {
    constructor({ id, title, description = "", questions = [] }) {
        if (typeof id !== "string" || id.trim() === "") {
            throw new Error("Κάθε ερωτηματολόγιο χρειάζεται έγκυρο id.");
        }

        if (typeof title !== "string" || title.trim() === "") {
            throw new Error("Κάθε ερωτηματολόγιο χρειάζεται τίτλο.");
        }

        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error(`Το ερωτηματολόγιο "${title}" πρέπει να έχει τουλάχιστον μία ερώτηση.`);
        }

        this.id = id.trim();
        this.title = title.trim();
        this.description = typeof description === "string" ? description.trim() : "";
        this.questions = questions;
    }

    static fromJSON(rawQuestionnaire, questionnaireIndex = 0) {
        const questionnaireId = typeof rawQuestionnaire?.id === "string" && rawQuestionnaire.id.trim() !== ""
            ? rawQuestionnaire.id.trim()
            : `questionnaire-${questionnaireIndex + 1}`;

        const rawQuestions = Array.isArray(rawQuestionnaire?.questions) ? rawQuestionnaire.questions : [];
        const questions = rawQuestions.map((rawQuestion, questionIndex) => new Question({
            id: typeof rawQuestion?.id === "string" && rawQuestion.id.trim() !== ""
                ? rawQuestion.id.trim()
                : `${questionnaireId}-question-${questionIndex + 1}`,
            text: rawQuestion?.text,
            answers: rawQuestion?.answers,
        }));

        return new Questionnaire({
            id: questionnaireId,
            title: rawQuestionnaire?.title,
            description: rawQuestionnaire?.description,
            questions,
        });
    }

    getMinScore() {
        return this.questions.reduce((total, question) => total + question.getMinValue(), 0);
    }

    getMaxScore() {
        return this.questions.reduce((total, question) => total + question.getMaxValue(), 0);
    }

    normalizeScore(rawScore) {
        const minScore = this.getMinScore();
        const maxScore = this.getMaxScore();

        if (maxScore === minScore) {
            return 0;
        }

        const ratio = (rawScore - minScore) / (maxScore - minScore);
        return Math.round(clamp(ratio, 0, 1) * 100);
    }

    interpretationForScore(score) {
        const normalizedScore = clamp(score, 0, 100);

        if (normalizedScore <= 20) {
            return {
                label: "Πολύ χαμηλό",
                tone: "low",
                summary: `Η τωρινή ένδειξη για «${this.title}» φαίνεται πολύ χαμηλή.`
            };
        }

        if (normalizedScore <= 40) {
            return {
                label: "Χαμηλό",
                tone: "soft",
                summary: `Η τωρινή ένδειξη για «${this.title}» βρίσκεται σε χαμηλό επίπεδο.`
            };
        }

        if (normalizedScore <= 60) {
            return {
                label: "Μέτριο",
                tone: "balanced",
                summary: `Η τωρινή ένδειξη για «${this.title}» είναι σε μεσαία ζώνη.`
            };
        }

        if (normalizedScore <= 80) {
            return {
                label: "Υψηλό",
                tone: "elevated",
                summary: `Η τωρινή ένδειξη για «${this.title}» εμφανίζεται αρκετά αυξημένη.`
            };
        }

        return {
            label: "Πολύ υψηλό",
            tone: "intense",
            summary: `Η τωρινή ένδειξη για «${this.title}» είναι πολύ αυξημένη.`
        };
    }

    evaluate(answersByQuestionId) {
        if (!answersByQuestionId || typeof answersByQuestionId !== "object") {
            throw new Error("Δεν δόθηκαν απαντήσεις για αξιολόγηση.");
        }

        const rawScore = this.questions.reduce((total, question) => {
            const rawValue = answersByQuestionId[question.id];

            if (rawValue === undefined || rawValue === null || rawValue === "") {
                throw new Error(`Λείπει απάντηση για την ερώτηση: ${question.text}`);
            }

            const numericValue = Number(rawValue);

            if (!Number.isFinite(numericValue) || !question.hasValue(numericValue)) {
                throw new Error(`Μη έγκυρη απάντηση για την ερώτηση: ${question.text}`);
            }

            return total + numericValue;
        }, 0);

        const normalizedScore = this.normalizeScore(rawScore);

        return {
            rawScore,
            minScore: this.getMinScore(),
            maxScore: this.getMaxScore(),
            normalizedScore,
            interpretation: this.interpretationForScore(normalizedScore),
        };
    }
}

export function createQuestionnaires(rawQuestionnaires) {
    if (!Array.isArray(rawQuestionnaires)) {
        throw new Error("Το αρχείο questionnaire.json πρέπει να περιέχει λίστα ερωτηματολογίων.");
    }

    return rawQuestionnaires.map((rawQuestionnaire, index) => Questionnaire.fromJSON(rawQuestionnaire, index));
}