const socket = io();

const playersList = document.querySelector('#playersList');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('roomCode');
const nickname = params.get('nickname');
console.log(roomCode, nickname);

socket.on('players-update', namesArr => {
    playersList.textContent = namesArr.join(', \n');
});

socket.emit('rejoin-room', {roomCode, nickname});