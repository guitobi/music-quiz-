const socket = io();

let currentRoom = null;
let currentUserNickname = null;
let isHost = false;

socket.emit("hello", "Hello from client");
socket.on("response", (data) => console.log(data));

const messageSendBtnEl = document.querySelector(".btn");
const inputEl = document.querySelector("#messageInput");
const chatDivEl = document.querySelector(".messageContainer");
const createRoomBtn = document.querySelector(".createRoom");
const joinRoomBtn = document.querySelector(".joinRoom");
const startGameBtn = document.querySelector(".startGame");
const nameInputEl = document.querySelector(".nameInput");
const errorDiv = document.querySelector(".error-div");
const roomInfo = document.querySelector(".roomInfo");
// const playersListDiv = document.getElementById('playerList'); // Цей селектор більше не потрібен у такому вигляді
const roomCodeInput = document.querySelector(".roomCode");
const volumeSlider = document.getElementById("volumeSlider");
const roundDurationSlider = document.querySelector("#durationSlider");
const durationSliderDisplay = document.querySelector("#durationSliderDisplay");
const totalRoundsInput = document.querySelector("#totalRounds");

// селектори щоб забрати їх з екрану при приєднанні до кімнати
const forms = document.querySelector(".form-group");
const lobbySection = document.querySelectorAll(".lobby-section");
const initialForms = document.getElementById("initial-forms");
const activeLobbyContent = document.getElementById("active-lobby-content");

const searchPlaylistBtn = document.getElementById("searchPlaylistBtn");
const playlistSearchInput = document.getElementById("playlistSearchInput");
const searchResultsDiv = document.getElementById("searchResults");

const body = document.querySelector("body");

socket.on("message", ({ userNickname, text }) => {
  const chatMessages = document.getElementById("chat-messages");
  const messageElement = document.createElement("p");
  messageElement.innerHTML = `<strong>${userNickname}:</strong> ${text}`;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on("room-joined", ({ userNickname, roomCode, Host }) => {
  // initialForms.hidden = true;
  // activeLobbyContent.hidden = false;
  body.classList.add("active-lobby");
  isHost = Host;
  if (isHost) {
    document.getElementById("host-controls").hidden = false;
  } else {
    document.getElementById("host-controls").hidden = true;
  }
  currentRoom = roomCode;
  document.getElementById("displayRoomCode").textContent = roomCode;
  currentUserNickname = userNickname;
  nameInputEl.value = "";
  roomCodeInput.value = "";
});

socket.on("game-started", ({ roomCode }) => {
  window.location.href = `game.html?roomCode=${roomCode}&nickname=${currentUserNickname}`;
});

socket.on("error-nickname-taken", () => {
  errorDiv.textContent = `This nickname is alredy taken.(єбать ти лох, точно шось з хохлами хотів, та?)`;
});

socket.on("error-game-in-progress", () => {
  errorDiv.textContent = `Game is already in progress`;
});

socket.on("players-update", (players) => {
  // Переконуємось, що оновлюємо список гравців саме у лобі
  const playerListItems = document.querySelector(
    "#active-lobby-content .player-list-items"
  );
  if (!playerListItems) return;

  playerListItems.innerHTML = "";

  players.forEach((player, index) => {
    const playerElement = document.createElement("div");
    playerElement.className = "player-item";
    playerElement.innerHTML = `
            <span class="name">${player.name}</span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="score">${player.score || 0}</span>
                ${player.isHost ? '<span class="host-badge">HOST</span>' : ""}
            </div>
        `;
    playerListItems.appendChild(playerElement);
  });
});

socket.on("playlist-preview", ({ tracks, playlistName }) => {
  const previewContainer = document.getElementById("playlistTracksPreview");
  previewContainer.hidden = false;
  previewContainer.innerHTML = `<h4>${playlistName}</h4>`;

  tracks.forEach((track) => {
    const trackElement = document.createElement("div");
    trackElement.className = "playlist-track";
    trackElement.innerHTML = `<strong>${track.name}</strong> - ${track.artist}`;
    previewContainer.appendChild(trackElement);
  });
});

socket.on("playlist-updated", ({ playlistId, playlistName, hostId }) => {
  document.getElementById("currentPlaylistName").textContent = playlistName;

  if (socket.id !== hostId) {
    document.getElementById("playlistIdInput").value = playlistId;
  }
});

const createRoom = async () => {
  // isHost = true;
  // startGameBtn.hidden = true;
  errorDiv.innerHTML = "";
  const userNickname = nameInputEl.value.trim();
  if (userNickname === "") {
    const errorP = document.createElement("p");
    errorP.textContent = "Enter a valid nickname";
    errorDiv.appendChild(errorP);
    return;
  } else {
    try {
      currentUserNickname = userNickname;
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: currentUserNickname,
        }),
      });
      const data = await res.json();
      const roomCodeParsed = data.roomCode;
      socket.emit("join-room", { userNickname, roomCode: roomCodeParsed });
      // startGameBtn.removeAttribute('hidden');
    } catch (err) {
      console.error(err);
    }
  }
};

const joinRoom = async () => {
  console.log(
    `Checking Nickname: "${nameInputEl.value}", Room Code: "${roomCodeInput.value}"`
  );
  errorDiv.innerHTML = "";
  const userNickname = nameInputEl.value.trim();
  const roomCode = roomCodeInput.value.trim();
  if (userNickname === "" || roomCode === "") {
    const errorP = document.createElement("p");
    errorP.textContent = "Enter a valid nickname or room code!";
    errorDiv.appendChild(errorP);
    return;
  } else {
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      if (!res.ok) {
        errorDiv.textContent = `ЖОПА з вашим json`;
        return;
      }
      const data = await res.json();
      if (!data.exists) {
        errorDiv.textContent = "ЖОПЖОПА з вашим json ( ігор )";
        return;
      }
      socket.emit("join-room", { userNickname, roomCode });
      currentRoom = roomCode;
      currentUserNickname = userNickname;
      roomCodeInput.value = "";
      nameInputEl.value = "";
    } catch (err) {
      console.error(err);
    }
  }
};

const startGame = () => {
  socket.emit("start-game", { roomCode: currentRoom });
};

const extractPlaylistId = (input) => {
  if (!input.includes("/") && !input.includes(":") && input.length > 15) {
    return input;
  }

  try {
    const url = new URL(input);
    const segments = url.pathname.split("/");
    const playlistIndex = segments.indexOf("playlist");
    if (playlistIndex !== -1 && segments[playlistIndex + 1]) {
      return segments[playlistIndex + 1];
    }
  } catch (e) {}

  const match = input.match(/playlist[:/]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
};

messageSendBtnEl.addEventListener("click", () => {
  if (!currentRoom) {
    alert("У тебе немає друзів (або ти не в кімнаті)");
    return;
  }

  const message = inputEl.value.trim();
  if (message === "") return;

  socket.emit("message", {
    userNickname: currentUserNickname,
    roomCode: currentRoom,
    text: message,
  });
  inputEl.value = "";
});

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
startGameBtn.addEventListener("click", startGame);

inputEl.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    messageSendBtnEl.click();
  }
});

document.querySelectorAll(".preset-buttons button").forEach((button) => {
  button.addEventListener("click", () => {
    const playlistId = button.getAttribute("data-id");
    const playlistName = button.getAttribute("data-name");
    document.getElementById("playlistIdInput").value = playlistId;
    document.getElementById("currentPlaylistName").textContent = playlistName;
    if (isHost) {
      socket.emit("change-playlist", {
        roomCode: currentRoom,
        playlistId: playlistId,
        playlistName: playlistName,
      });
    }
  });
});

document.getElementById("applyPlaylistBtn").addEventListener("click", () => {
  const rawInput = document.getElementById("playlistIdInput").value.trim();

  const playlistId = extractPlaylistId(rawInput);

  if (playlistId && isHost) {
    document.getElementById("playlistIdInput").value = playlistId;

    document.getElementById("currentPlaylistName").textContent = "Loading...";

    socket.emit("change-playlist", {
      roomCode: currentRoom,
      playlistId: playlistId,
      playlistName: playlistId,
    });
  } else {
    alert("Invalid Playlist URL or ID");
  }
});

searchPlaylistBtn.addEventListener("click", async () => {
  const query = playlistSearchInput.value.trim();

  if (query === "") {
    alert("Enter a search term!");
    return;
  }

  try {
    const res = await fetch(
      `/api/search-playlists?q=${encodeURIComponent(query)}`
    );
    const data = await res.json();

    if (data.error) {
      alert("Error searching playlists");
      return;
    }

    displaySearchResults(data.playlists);
  } catch (err) {
    console.error("Search error:", err);
    alert("Failed to search playlists");
  }
});

const displaySearchResults = (playlists) => {
  searchResultsDiv.hidden = false;
  searchResultsDiv.innerHTML = "<h4>Search Results:</h4>";

  if (playlists.length === 0) {
    searchResultsDiv.innerHTML += "<p>No playlists found</p>";
    return;
  }

  playlists.forEach((playlist) => {
    const resultItem = document.createElement("div");
    resultItem.className = "search-result-item";
    resultItem.innerHTML = `
            <div class="result-info">
                ${
                  playlist.image
                    ? `<img src="${playlist.image}" alt="${playlist.name}">`
                    : ""
                }
                <div>
                    <strong>${playlist.name}</strong>
                    <p>by ${playlist.owner} • ${playlist.tracks} tracks</p>
                </div>
            </div>
            <button class="btn select-playlist-btn" data-id="${
              playlist.id
            }" data-name="${playlist.name}">Select</button>
        `;
    searchResultsDiv.appendChild(resultItem);
  });

  // Обробник для кнопок "Select"
  document.querySelectorAll(".select-playlist-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const playlistId = btn.getAttribute("data-id");
      const playlistName = btn.getAttribute("data-name");

      document.getElementById("playlistIdInput").value = playlistId;
      document.getElementById("currentPlaylistName").textContent = playlistName;

      if (isHost) {
        socket.emit("change-playlist", {
          roomCode: currentRoom,
          playlistId: playlistId,
          playlistName: playlistName,
        });
      }

      searchResultsDiv.hidden = true;
      playlistSearchInput.value = "";
    });
  });
};

// Пошук по Enter
playlistSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    searchPlaylistBtn.click();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const autoRoomCode = params.get("roomCode");
  const autoNickname = params.get("nickname");

  if (autoRoomCode && autoNickname) {
    nameInputEl.value = autoNickname;
    roomCodeInput.value = autoRoomCode;
    joinRoom(); // Викликаємо твою існуючу функцію приєднання
  }
});

roundDurationSlider.oninput = () => {
  durationSliderDisplay.innerHTML = roundDurationSlider.value;
};

roundDurationSlider.addEventListener("change", () => {
  socket.emit("duration-change", {
    roundDuration: roundDurationSlider.value,
    roomCode: currentRoom,
  });
});

totalRoundsInput.addEventListener("change", () => {
  socket.emit("total-rounds-change", {
    totalRounds: totalRoundsInput.value,
    roomCode: currentRoom,
  });
});
