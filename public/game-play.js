const socket = io();

const playersList = document.querySelector('#playersList');
const startBtnDiv = document.querySelector('.startBtn');
const questionField = document.querySelector('.questionField');
const audioPlayer = document.querySelector('#audioPlayer');
const createBtn = document.createElement('button');
const answerResultContainer = document.createElement('div');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('roomCode');
const nickname = params.get('nickname');
const isHost = params.get('isHost');

let currentQuestion = null;
let hasAnswered = false;

socket.on('players-update', players => {
    playersList.innerText = players.map(p => `${p.name}: ${p.score}🏆`).join('\n');
});

socket.on('new-round', question => {
    currentQuestion = question;
    hasAnswered = false;
    const questionH = document.createElement('h3');
    questionField.innerHTML = '';
    questionH.textContent = "Guess the Artist!";
    questionField.appendChild(questionH);
    question.options.forEach(option => {
        const markup = `
            <button data-artist="${option}">${option}</button>
            `
            questionField.insertAdjacentHTML('beforeend', markup);
        });
});

socket.on('submit-result', result => {
    const res = document.createElement('p');
    answerResultContainer.innerHTML = '';
    answerResultContainer.textContent = result;
    questionField.appendChild(answerResultContainer);
    answerResultContainer.appendChild(res);
    audioPlayer.pause();
});

socket.on('round-over', () => {
    if (isHost === 'true') {
        createBtn.hidden = false;
    }
    audioPlayer.pause();
    const questionH = questionField.querySelector('h3');
    questionH.textContent = currentQuestion.trackName;
});

socket.on('play-track', ({ url }) => {
    audioPlayer.src = url;
    audioPlayer.play();
});

socket.emit('rejoin-room', {roomCode, nickname});

const createStartBtn = () => {
    if (isHost === 'true') {
        createBtn.id = "startRoundBtn";
        createBtn.textContent = 'Start Round'
        startBtnDiv.appendChild(createBtn);
        createBtn.addEventListener('click', startRound);
    }
};

const startRound = () => {
    socket.emit('start-round', roomCode);
    createBtn.hidden = true;
};

questionField.addEventListener('click', (e) => {
    if (hasAnswered === true) return;
    if (e.target.tagName === 'BUTTON') {
        audioPlayer.pause();
        const answer = e.target.dataset.artist;
        hasAnswered = true;
        // console.log(answer)
        socket.emit('submit-button', {roomCode, nickname, answer});
    };
});

createStartBtn();

