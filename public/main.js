function createTable(container) {
    var table = '<table class="jeopardy jeopardy-table">';
    table += '<tr height="15%">';
    for (cat = 0; cat < 6; cat++) {
        table += `<td id="cell-cat-${cat}"><h1 id="cat-${cat}"></td>`;
    }
    table += '</tr>'
    
    for (row = 0; row < 5; row++) {
        table += '<tr height="14%">';
        for (cat = 0; cat < 6; cat++) {
            table += `<td id="cell-${row}-${cat}"><h1 id="question-${row}-${cat}" /></td>`;
        }
        table += '</tr>'
    }

    table += '<tr height="15%">';
    for (player = 0; player < 3; player++) {
        table += `<td id="player-cell-${player}" colspan="2"><h1 id="player-${player}">`;
        table += `<span id="player-${player}-name"/> `;
        table += `<span id="player-${player}-score"/>`;
        table += `</h1></td>`
    }
    table += '</tr>'
    table += '</table>'
    $(container).html(table);
}

function updateTable(status) {
    for (let cat = 0; cat < 6; cat++) {
        if (status.phase < 3) {
            if (!status.categoriesShown[cat]) {
                $("#cat-" + cat).hide(); 
            } else {
                $("#cat-" + cat).fadeIn();
            }
            $("#cat-" + cat).text(status.categories[status.phase - 1][cat]);
        } else {
            $("#cat-" + cat).text('');
        }
        for (let row = 0; row < 5; row++) {
            let question = row + "-" + cat;
            if (status.phase == 3) {
                text = " ";
                if (row == 1) {
                    if (cat == 2) {
                        text = 'Final';
                    }
                    if (cat == 3) {
                        text = 'Jeopardy!'
                    }
                }
                $("#question-" + question).text(text);
                continue;
            }

            let money = 200 * (row + 1) * status.phase;
            if (status.answeredQuestions.includes(question)) {
                $("#question-" + question).text(" ");
            } else {
                $("#question-" + question).text(money);
            }
            if (status.activeQuestion == question) {
                $("#cell-" + question).addClass("selected");
                if (status.dailyDoubles.includes(status.phase + "-" + question)) {
                    $("#question-" + question).text("DAILY DOUBLE");
                    $("#cell-" + question).addClass("daily-double");
                }
            } else {
                $("#cell-" + question).removeClass();
            }
        }
    }
    for (let player = 0; player < 3; player++) {
        if (status.playersJoined[player]) {
            $("#player-" + player).fadeIn();
        } else {
            $("#player-" + player).hide();
        }
        $("#player-" + player + "-name").text(status.players[player] + ":");
        $("#player-" + player + "-score").text(status.scores[player]);
        if (status.scores[player] < 0) {
            $("#player-" + player).addClass("minus");
        } else {
            $("#player-" + player).removeClass("minus");
        }
        if (status.selectorPlayer == player && status.phase < 3) {
            $("#player-" + player).addClass("selector");
        } else {
            $("#player-" + player).removeClass("selector");
        }
        if (status.answeringPlayer == player || status.testPlayer == player) {
            $("#player-cell-" + player).addClass("selected");
        } else {
            $("#player-cell-" + player).removeClass("selected");
        }
    }
}
