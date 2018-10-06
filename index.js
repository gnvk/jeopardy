var express = require('express');
var app = express();
var session = require('express-session');
var bodyParser = require("body-parser");
app.use(session({
    secret: 'veszett titkos',
    resave: true,
    saveUninitialized: true,
    cookie: { httpOnly: false }
}));
app.use(bodyParser.urlencoded({
    extended: true
}));

var fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 4560;

const players = require(__dirname + '/players.json');
const questionsTsv = fs.readFileSync(__dirname + '/questions.tsv', 'utf-8');
const cells = questionsTsv.split('\n').map(x => x.split('\t'))
categories = []
questions = []
dailyDoubles = []
for (let phase = 0; phase < 2; phase++) {
    categories_phase = []
    questions_phase = []
    for (let cat = 0; cat < 6; cat++) {
        categories_phase.push(cells[phase * 11][cat]);
        questions_cat = []
        for (let question = 0; question < 5; question++) {
            let row = 1 + phase * 11 + question * 2;
            questions_cat.push([
                cells[row][cat],
                cells[row + 1][cat]
            ]);
        }
        questions_phase.push(questions_cat);
    }
    for (let dd = 0; dd < phase + 1; dd++) {
        let cat = parseInt(cells[23 + phase + dd][1]) - 1;
        let question = parseInt(cells[23 + phase + dd][2]) - 1;
        dailyDoubles.push(`${phase + 1}-${question}-${cat}`);
    }
    categories.push(categories_phase)
    questions.push(questions_phase);
}
final_question = cells[23][4];
final_answer = cells[24][4];
questions.push([final_question, final_answer]);


const GAME_STATE_FILE = 'game.json'
var status = {
    phase: 1,
    activeQuestion: null,
    answeredQuestions: [],
    answeringPlayer: null,
    alreadyAnswered: [false, false, false],
    beepEnabled: false,
    categories: categories,
    categoriesShown: [false, false, false, false, false, false],
    dailyDoubles: dailyDoubles,
    scores: [0, 0, 0],
    selectorPlayer: 0,
    players: players.names,
    playersJoined: [false, false, false],
    test: false,
    testPlayer: null
}
try {
    status = JSON.parse(fs.readFileSync(GAME_STATE_FILE));
    status.playersJoined = [false, false, false];
    console.log("Loaded last game");
} catch(err) {
    console.log("Starting brand new game");
}
var selectedBet = 0;

app.use(express.static(__dirname + '/public'));

app.get('/login', function (req, res) {
    res.sendFile(__dirname + '/login.html');
});
app.post('/login', function (req, res) {
    let code = req.body.code.toLowerCase();
    if (code == 'malacka') {
        req.session.admin = true;
        return res.redirect('/admin');
    }
    let playerId = players.codes.indexOf(code);
    if (playerId < 0) {
        return res.redirect('/login');
    }
    req.session.playerId = playerId;
    req.session.name = players.names[playerId];
    return res.redirect('/');
});
app.get('/logout', function (req, res) {
    req.session.destroy();
    res.sendFile(__dirname + '/login.html');
});

app.get('/', function (req, res) {
    if (req.session.playerId == null) {
        return res.redirect('/login');
    }
    res.sendFile(__dirname + '/index.html');
});

app.get('/admin', function (req, res) {
    if (!req.session.admin) {
        return res.redirect('/login');
    }
    res.sendFile(__dirname + '/admin.html');
});

app.get('/questions', function (req, res) {
    if (req.session.admin) {
        res.send(JSON.stringify(questions));
    } else {
        res.send('Login first!');
    }
});

app.get('/present', function (req, res) {
    res.sendFile(__dirname + '/present.html');
});

app.get('/user', function (req, res) {
    res.send(JSON.stringify({
        id: req.session.playerId,
        name: req.session.name,
        score: status.scores[req.session.playerId]
    }));
});

io.on('connection', function (socket) {
    io.emit('status', status);

    socket.on('beep', function (player) {
        if (status.beepEnabled) {
            if (status.activeQuestion && !status.alreadyAnswered[player]) {
                status.answeringPlayer = player;
                status.playersJoined[player] = true;
                status.beepEnabled = false;
                io.emit('sound', 'beep');
                io.emit('status', status);
            } else if (status.test && status.testPlayer == null) {
                status.testPlayer = player;
                status.playersJoined[player] = true;
                status.beepEnabled = false;
                io.emit('sound', 'beep');
                io.emit('status', status);
            }
        }
    });

    socket.on('hello', function (player) {
        status.playersJoined[player] = true;
        io.emit('status', status);
    });

    socket.on('admin', function (msg) {
        if (msg.cmd == "show-category") { 
            let cat = parseInt(msg.category);
            status.categoriesShown[cat] = true;
        } else if (msg.cmd == "select-question") {
            if (status.activeQuestion == null && !status.answeredQuestions.includes(msg.question) &&
                    status.categoriesShown.every(x => x)) {
                status.activeQuestion = msg.question;
                status.alreadyAnswered = [false, false, false];
                if (status.dailyDoubles.includes(status.phase + "-" + status.activeQuestion)) {
                    io.emit('sound', 'daily-double');
                } else {
                    status.beepEnabled = true;
                }
            }
        } else if (msg.cmd == "answer") {
            if (status.answeringPlayer != null && status.activeQuestion != null) {
                let row = parseInt(status.activeQuestion.split("-")[0]);
                let money = (row + 1) * 200 * status.phase;
                let dailyDouble = status.dailyDoubles.includes(status.phase + "-" + status.activeQuestion);
                let bet = status.phase == 3;
                if (bet || dailyDouble) {
                    money = selectedBet;
                }
                if (msg.correct) {
                    status.scores[status.answeringPlayer] += money;
                    status.answeredQuestions.push(status.activeQuestion);
                    status.activeQuestion = null;
                    status.selectorPlayer = status.answeringPlayer;
                    io.emit('sound', 'right-answer');
                } else {
                    status.scores[status.answeringPlayer] -= money;
                    if (!bet && !dailyDouble && !status.alreadyAnswered.every(x => x)) {
                        status.beepEnabled = true;
                    } else {
                        status.answeredQuestions.push(status.activeQuestion);
                        status.activeQuestion = null;
                    }
                    io.emit('sound', 'times-up');
                }
                status.alreadyAnswered[status.answeringPlayer] = true;
                status.answeringPlayer = null;
            }
        } else if (msg.cmd == "pass") {
            if (status.activeQuestion != null) {
                status.answeredQuestions.push(status.activeQuestion);
                status.activeQuestion = null;
                status.beepEnabled = false;
            }
        } else if (msg.cmd == "double") {
            if (status.phase == 1) {
                status.phase = 2;
                status.activeQuestion = null
                status.answeredQuestions = []
                status.answeringPlayer = null;
                status.selectorPlayer = status.scores.indexOf(Math.min(...status.scores));
                status.categoriesShown = [false, false, false, false, false, false];
            }
        } else if (msg.cmd == "final") {
            if (status.phase == 2) {
                status.phase = 3;
                status.answeringPlayer = null;
                status.alreadyAnswered = [false, false, false];
            }
        } else if (msg.cmd == "select-player") {
            let bet = status.phase == 3 && !status.alreadyAnswered[msg.player];
            let dailyDouble = status.dailyDoubles.includes(status.phase + "-" + status.activeQuestion);
            if (dailyDouble || bet) {
                status.answeringPlayer = msg.player;
                selectedBet = parseInt(msg.amount);
            } 
            if (bet) {
                status.activeQuestion = '3-0-0';
            }
        } else if (msg.cmd == "change-score") {
            status.scores[msg.player] = parseInt(msg.score);
        } else if (msg.cmd == "test") {
            if (status.answeredQuestions.length == 0 && status.activeQuestion == null) {
                if (status.test) {
                    status.beepEnabled = false;
                    status.test = false;
                    status.testPlayer = null;
                } else {
                    status.beepEnabled = true;
                    status.test = true;
                    status.testPlayer = null;
                }
            }
        }
        io.emit('status', status);
        var json = JSON.stringify(status);
        fs.writeFile(GAME_STATE_FILE, json, 'utf8', function() {});
    });

    socket.on('sound', function (sound) {
        io.emit('sound', sound);
    });
});

http.listen(port, function () {
    console.log('listening on *:' + port);
});
