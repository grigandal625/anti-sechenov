function download(filename, text) {
    let element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    element.setAttribute("download", filename);

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function getParameterByName(name, url = window.location.href) {
    name = name.replace(/[\[\]]/g, "\\$&");
    let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return "";
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

class AntiSech {
    static async login(username, password) {
        return await (
            await fetch(`https://sechenov.online/sso/login`, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    mode: "cors",
                },
                body: JSON.stringify({ username, password }),
            })
        ).json();
    }

    static async sendAnswers(testId, accessToken, tokenType, answers) {
        return await (
            await fetch(`https://sechenov.online/api/tests/${testId}`, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `${tokenType} ${accessToken}`,
                },
                body: JSON.stringify(answers),
            })
        ).json();
    }

    static async getQuestions(testId, accessToken, tokenType) {
        return await (
            await fetch(`https://sechenov.online/api/tests/${testId}`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    mode: "cors",
                    Authorization: `${tokenType} ${accessToken}`,
                },
            })
        ).json();
    }

    static async getCourse(courseId, accessToken, tokenType) {
        return await (
            await fetch(`https://sechenov.online/api/courses/${courseId}?language=ru`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    mode: "cors",
                    Authorization: `${tokenType} ${accessToken}`,
                },
            })
        ).json();
    }

    static async getTestInfo(testId, accessToken, tokenType) {
        return await (
            await fetch(`https://sechenov.online/api/tests/${testId}/meta`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    mode: "cors",
                    Authorization: `${tokenType} ${accessToken}`,
                },
            })
        ).json();
    }

    static async getLesson(lessonId, accessToken, tokenType) {
        return await (
            await fetch(`https://sechenov.online/api/lessons/${lessonId}`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    mode: "cors",
                    Authorization: `${tokenType} ${accessToken}`,
                },
            })
        ).json();
    }

    static currentCourse() {
        if (location.href.indexOf("sechenov.online/course/learn?") != -1) {
            return getParameterByName("id");
        }
        return null;
    }

    static currentStep() {
        if (location.href.indexOf("sechenov.online/course/learn?") != -1) {
            return getParameterByName("stepId");
        }
        return null;
    }

    constructor(username, password, known) {
        this.username = username;
        this.password = password;
        this.known = known || [];
    }

    async auth(username, password) {
        let response = await AntiSech.login(username, password);
        if (response.access_token) {
            this.accessToken = response.access_token;
            this.tokenType = response.token_type[0].toUpperCase() + response.token_type.slice(1);
            return true;
        } else {
            return false;
        }
    }

    async authorize() {
        return await this.auth(this.username, this.password);
    }

    async getCourseSteps(courseId) {
        let course = await AntiSech.getCourse(courseId, this.accessToken, this.tokenType);
        let steps = [];
        course.modules.map((m) => {
            steps = steps.concat(m.steps);
        });
        this.courseId = courseId;
        return steps;
    }

    async getCurrentCourseSteps() {
        if (AntiSech.currentCourse()) {
            return await this.getCourseSteps(AntiSech.currentCourse());
        }
    }

    async getCourseUnblockedStep(courseId) {
        let steps = await this.getCourseSteps(courseId);
        let index =
            steps.map((s) => s.isBlocked).indexOf(true) != -1
                ? Math.min(steps.map((s) => s.isBlocked).indexOf(true) - 1, steps.map((s) => s.viewed).indexOf(false))
                : steps.map((s) => s.viewed).indexOf(false);
        if (index + 1) {
            console.log(`Пройден шаг ${index}/${steps.length - 1}`);
        }
        return steps[index];
    }

    async getCurrentCourseUnblockedStep() {
        if (AntiSech.currentCourse()) {
            return await this.getCourseUnblockedStep(AntiSech.currentCourse());
        }
    }

    async passLesson(lessonId) {
        return await AntiSech.getLesson(lessonId, this.accessToken, this.tokenType);
    }

    makeAnswers(questions, testId, correct = false) {
        return questions.map((e) => {
            let obj = {
                questionId: e.id,
                answerIds: this.known
                    .filter((e) => e.testId == testId)[0]
                    .questions.map((q) => q.id)
                    .includes(e.id)
                    ? correct
                        ? this.known
                              .filter((e) => e.testId == testId)[0]
                              .questions.filter((q) => q.id == e.id)[0]
                              .answers.filter((a) => a.valid)
                              .map((a) => a.id)
                        : this.known
                              .filter((e) => e.testId == testId)[0]
                              .questions.filter((q) => q.id == e.id)[0]
                              .answers.filter((a) => !a.valid)
                              .map((a) => a.id)
                    : e.answers.map((a) => a.id),
            };
            return obj;
        });
    }

    async collect(testId, correct = false) {
        let questions = await AntiSech.getQuestions(testId, this.accessToken, this.tokenType);
        let response = await AntiSech.sendAnswers(
            testId,
            this.accessToken,
            this.tokenType,
            this.makeAnswers(questions, testId, correct)
        );

        if (response.questions) {
            let allHas = true;
            response.questions.map((e) => {
                allHas =
                    allHas &&
                    this.known
                        .filter((e) => e.testId == testId)[0]
                        .questions.map((e) => e.questionId)
                        .indexOf(e.id) != -1;
                if (
                    this.known
                        .filter((e) => e.testId == testId)[0]
                        .questions.map((q) => q.id)
                        .indexOf(e.id) == -1
                ) {
                    if (!this.known.filter((e) => e.testId == testId)[0]) {
                        this.known.push({ questions: [], testId });
                    }
                    this.known.filter((e) => e.testId == testId)[0].questions.push(e);
                }
            });
            return allHas;
        } else {
            this.known.filter((e) => e.testId == testId)[0].title += " (не полностью)";
            this.known.filter((e) => e.testId == testId)[0].questionCount = this.known.filter(
                (e) => e.testId == testId
            )[0].questions.length;
            return true;
        }
    }

    async collectToTheEnd(testId) {
        if (
            this.known.filter((e) => e.testId == testId)[0].questions.length <
            this.known.filter((e) => e.testId == testId)[0].questionCount
        ) {
            await this.collect(testId);
            await this.collectToTheEnd(testId);
        } else {
            console.log(`Собраны ответы на тест с id = ${testId}`);
        }
    }

    async passTest(testId) {
        let info = await AntiSech.getTestInfo(testId, this.accessToken, this.tokenType);
        this.known = this.known || [];
        this.known.push({
            testId: parseInt(testId),
            questionCount: info.maximumPossibleScore,
            questions: [],
            title: info.title,
            retitled: false,
        });
        await this.collectToTheEnd(testId);
        return await this.collect(testId, true);
    }

    async makeStep(step) {
        if (step.stepType == "LESSON") {
            return await this.passLesson(step.lessonId);
        } else {
            return await this.passTest(step.testId);
        }
    }

    async runCourse(courseId) {
        let step = await this.getCourseUnblockedStep(courseId);
        if (step) {
            await this.makeStep(step);
            await this.runCourse(courseId);
        }
    }

    async runCurrentCourse() {
        await this.runCourse(AntiSech.currentCourse());
    }

    getStepModule(course, step) {
        return course.modules.filter((m) =>
            m.steps
                .map((s) => (step.testId ? s.testId : s.lessonId))
                .includes(step.testId ? step.testId : step.lessonId)
        )[0];
    }

    async retitleKnown(courseId) {
        let course = await AntiSech.getCourse(courseId, this.accessToken, this.tokenType);
        this.known.map((e) => {
            if (e) {
                e.title = !e.retitled ? `${this.getStepModule(course, e).title}. ${e.title}` : e.title;
                e.retitled = true;
            }
            return e;
        });
    }

    knownHTML() {
        return `\n<h1>Содержание</h1>${this.known
            .map((e) => `\n<h3><a href="#${e.testId}">${e.title}</a></h3>`)
            .join("")}
        \n<h1>Ответы</h1>${this.known
            .map(
                (e) =>
                    `\n<h2 id="${e.testId}">${e.title}</h2>\n${e.questions
                        .map(
                            (e) =>
                                `<h3>${e.title}</h3>${e.description ? `<h5>${e.description}</h5>` : ""}${e.answers
                                    .map(
                                        (a) =>
                                            `\t<div>
                                        <code style="margin: 5px; background: ${a.valid ? "#c4ffc5" : "#ffc4c4"}">${
                                                a.valid ? "верный" : "неверный"
                                            }</code>
                                        <label>${a.title}</label>
                                    </div>`
                                    )
                                    .join("\n")}`
                        )
                        .join("\n")}`
            )
            .join("\n")}`;
    }

    openKnown() {
        let w = window.open();
        w.document.body.innerHTML = this.knownHTML();
    }

    static knownTestToQuestionsJson(test) {
        return test.questions.map((q) => {
            return {
                t: `${q.title} ${q.description ? q.description : ""}`,
                a: q.answers.map((a) => {
                    return {
                        v: a.title,
                        c: a.valid,
                    };
                }),
            };
        });
    }

    downloadTestMaker() {
        download(
            "makeTests.js",
            this.known
                .map(
                    (e, i) =>
                        `setTimeout(() => {
                    t.questions = (${JSON.stringify(
                        AntiSech.knownTestToQuestionsJson(e)
                    )}).map((e) => t.questionFromJSON(e));
                    t.saveAsTest(${e.testId})
                }, 1000 * ${i});`
                )
                .join("\n")
        );
    }

    downloadIndex() {
        download(
            "index.html",
            `<html>
            <head>
                <title>antisechenov</title>
            </head>
            <body>
            <div style="position: absolute; top: 60px;">
            <table>
            ${this.known
                .map(
                    (e) =>
                        `
                            <tr>
                                <td>
                                    <h4><a href="/${e.testId}.html" target="_blank">${e.title}</a></h4>
                                </td>
                                <td>
                                    <h4><a href="/answers.html#${e.testId}" target="_blank">Ответы</a></h4>
                                </td>
                            </tr>
                        `
                )
                .join("\n")}
                </table>
                </div>
            <div style="background-color: white; border: 2px solid black; position:fixed; font: 25px bold; width: 100%; top: 0px; left: 0px;">
                <span style="background-color: white; margin: 10px;">Тренировочные тесты</span>
                <span style="background-color: white; margin: 10px;"><a href="/answers.html" target="_blank">Все ответы</a></span>
                <span style="background-color: white; margin: 10px;"><a href="https://anonim.pythonanywhere.com/constructor" target="_blank">Конструктор тестов</a></span>
            </div>
            </body>
        </html>`
        );
    }
}

let as;

async function collectAnswers(as) {
    try {
        await as.runCurrentCourse();
        await as.retitleKnown(AntiSech.currentCourse());
        return true;
    } catch (e) {
        console.log(e);
        if (
            confirm(`Во время сбора ответов возникла ошибка.
Если продолжить, могут собраться не все ответы.
Продолжить?`)
        ) {
            return await collectAnswers(as);
        } else {
            return false;
        }
    }
}

async function run() {
    if (AntiSech.currentCourse()) {
        let username = prompt("Введите логин");
        if (username) {
            let password = prompt("Введите пароль");
            if (password) {
                as = new AntiSech(username, password);
                let authorized = await as.authorize();
                if (authorized) {
                    await collectAnswers(as);
                    if (
                        confirm(`Ответы собраны.
Чтобы скачать ответы в формате html, нажмите "Ок".
Чтобы открыть ответы на новой странице, нажмите "Отмена"`)
                    ) {
                        download("answers.html", as.knownHTML());
                    } else {
                        as.openKnown();
                    }
                } else if (confirm("Не удалось авторизоваться. Начать заново?")) {
                    await run();
                }
            } else if (confirm("Вы отменили ввод пароля. Начать заново?")) {
                await run();
            }
        } else if (confirm("Вы отменили ввод логина. Начать заново?")) {
            await run();
        }
    } else {
        alert("Вы не находитесь на странице курса");
    }
    return as;
}
run();
