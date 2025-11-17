const socket = io(); 

let currentRoom = null;
let currentUserNickname = null;
let isHost = false;

socket.emit('hello', 'Hello from client');
socket.on('response', data => console.log(data));

const messageSendBtnEl = document.querySelector('.btn');
const inputEl = document.querySelector('#messageInput');
const chatDivEl = document.querySelector('.messageContainer');
const createRoomBtn = document.querySelector('.createRoom');
const joinRoomBtn = document.querySelector('.joinRoom');
const startGameBtn = document.querySelector('.startGame');
const nameInputEl = document.querySelector('.nameInput');
const errorDiv = document.querySelector('.error-div');
const roomInfo = document.querySelector('.roomInfo');
// const playersListDiv = document.getElementById('playerList'); // Цей селектор більше не потрібен у такому вигляді
const roomCodeInput = document.querySelector('.roomCode');
const volumeSlider = document.getElementById('volumeSlider'); 

// селектори щоб забрати їх з екрану при приєднанні до кімнати
const forms = document.querySelector('.form-group');
const lobbySection = document.querySelectorAll('.lobby-section');
const initialForms = document.getElementById('initial-forms');
const activeLobbyContent = document.getElementById('active-lobby-content');
const body = document.querySelector('body');

socket.on('message', ({userNickname, text}) => {
    const chatMessages = document.getElementById('chat-messages');
    const messageElement = document.createElement('p');
    messageElement.innerHTML = `<strong>${userNickname}:</strong> ${text}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('room-joined', ({userNickname, roomCode, Host}) => {
    // initialForms.hidden = true; 
    // activeLobbyContent.hidden = false; 
    body.classList.add('active-lobby');
    isHost = Host;
    if (isHost) {
        document.getElementById('host-controls').hidden = false;
    } else {
        document.getElementById('host-controls').hidden = true;
    }
    currentRoom = roomCode;
    document.getElementById('displayRoomCode').textContent = roomCode;
    currentUserNickname = userNickname;
    nameInputEl.value = '';
    roomCodeInput.value = '';
});

socket.on('game-started', ({ roomCode }) => {
    window.location.href = `game.html?roomCode=${roomCode}&nickname=${currentUserNickname}`;
});

socket.on('error-nickname-taken', () => {
    errorDiv.textContent = `This nickname is alredy taken.(єбать ти лох, точно шось з хохлами хотів, та?)`;
});

socket.on('error-game-in-progress', () => {
    errorDiv.textContent = `Game is already in progress`;
});

socket.on('players-update', (players) => {
    // Переконуємось, що оновлюємо список гравців саме у лобі
    const playerListItems = document.querySelector('#active-lobby-content .player-list-items');
    if (!playerListItems) return; 
    
    playerListItems.innerHTML = '';
    
    players.forEach((player, index) => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.innerHTML = `
            <span class="name">${player.name}</span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="score">${player.score || 0}</span>
                ${player.isHost ? '<span class="host-badge">HOST</span>' : ''}
            </div>
        `;
        playerListItems.appendChild(playerElement);
    });
});

socket.on('playlist-preview', ({ tracks, playlistName }) => {
    const previewContainer = document.getElementById('playlistTracksPreview');
    previewContainer.hidden = false;
    previewContainer.innerHTML = `<h4>${playlistName}</h4>`;
    
    tracks.forEach(track => {
        const trackElement = document.createElement('div');
        trackElement.className = 'playlist-track';
        trackElement.innerHTML = `<strong>${track.name}</strong> - ${track.artist}`;
        previewContainer.appendChild(trackElement);
    });
});

socket.on('playlist-updated', ({ playlistId, playlistName, hostId }) => {
    document.getElementById('currentPlaylistName').textContent = playlistName;
    if (socket.id !== hostId) {
        document.getElementById('playlistIdInput').value = playlistId;
    }
});

const createRoom = async () => {
    // isHost = true;
    // startGameBtn.hidden = true;
    errorDiv.innerHTML =  '';
    const userNickname = nameInputEl.value.trim();
    if(userNickname === '') {
        const errorP = document.createElement('p');
        errorP.textContent = 'Enter a valid nickname';
        errorDiv.appendChild(errorP);
        return;
    } else {
        try {
            currentUserNickname = userNickname;
            const res = await fetch('/api/rooms', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerName: currentUserNickname
            })
            });
            const data = await res.json();
            const roomCodeParsed = data.roomCode;
            socket.emit('join-room', {userNickname, roomCode: roomCodeParsed});
            // startGameBtn.removeAttribute('hidden');
        } catch (err) {
            console.error(err);
        }
    };
};

const joinRoom = async () => {
    console.log(`Checking Nickname: "${nameInputEl.value}", Room Code: "${roomCodeInput.value}"`);
    errorDiv.innerHTML =  '';
    const userNickname = nameInputEl.value.trim();
    const roomCode = roomCodeInput.value.trim();
    if(userNickname === '' || roomCode === '') {
        const errorP = document.createElement('p');
        errorP.textContent = 'Enter a valid nickname or room code!';
        errorDiv.appendChild(errorP);
        return;
    } else {
        try {
        const res = await fetch(`/api/rooms/${roomCode}`);
        if (!res.ok) {
            errorDiv.textContent = `ЖОПА з вашим json`
            return;
        };
        const data = await res.json();
        if (!data.exists) {
            errorDiv.textContent = 'ЖОПЖОПА з вашим json ( ігор )';
            return;
        };
        socket.emit('join-room', {userNickname, roomCode});
        currentRoom = roomCode;
        currentUserNickname = userNickname;
        roomCodeInput.value = '';
        nameInputEl.value = '';
        } catch (err) {
        console.error(err);
        }
    } 
};

const startGame = () => {
    socket.emit('start-game', {roomCode: currentRoom});
};

// Цей обробник був дубльований, залишаю один
messageSendBtnEl.addEventListener('click', () => {
        if (!currentRoom) {
        alert('У тебе немає друзів (або ти не в кімнаті)');
        return;
    }
    
    const message = inputEl.value.trim();
    if (message === '') return;

    socket.emit('message', {
        userNickname: currentUserNickname,
        roomCode: currentRoom,
        text: message
    });
    inputEl.value = '';
});

createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
startGameBtn.addEventListener('click', startGame);

if (volumeSlider) { // Додаємо перевірку, бо в лобі слайдера немає
    volumeSlider.addEventListener('input', () => {
        socket.emit('volume-change', {
            roomCode: currentRoom,
            volume: volumeSlider.value
        });
    });
}

inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        messageSendBtnEl.click();
    }
});

document.querySelectorAll('.preset-buttons button').forEach(button => {
    button.addEventListener('click', () => {
        const playlistId = button.getAttribute('data-id');
        const playlistName = button.getAttribute('data-name');
        document.getElementById('playlistIdInput').value = playlistId;
        document.getElementById('currentPlaylistName').textContent = playlistName;
        if (isHost) {
            socket.emit('change-playlist', {
                roomCode: currentRoom,
                playlistId: playlistId,
                playlistName: playlistName
            });
        }
    });
});

document.getElementById('applyPlaylistBtn').addEventListener('click', () => {
    const playlistId = document.getElementById('playlistIdInput').value.trim();
    if (playlistId && isHost) {
        // Тут можна додати логіку для отримання назви плейлиста або використати заглушку
        const playlistName = playlistId.substring(0, 10) + '...';
        document.getElementById('currentPlaylistName').textContent = playlistName;
        
        socket.emit('change-playlist', {
            roomCode: currentRoom,
            playlistId: playlistId,
            playlistName: playlistName
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const autoRoomCode = params.get('roomCode');
    const autoNickname = params.get('nickname');

    if (autoRoomCode && autoNickname) {
        nameInputEl.value = autoNickname;
        roomCodeInput.value = autoRoomCode;
        joinRoom(); // Викликаємо твою існуючу функцію приєднання
    }
});