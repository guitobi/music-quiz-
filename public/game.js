const socket = io({
  transports: ["websocket"],
  upgrade: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

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

  // Зберігаємо стан в localStorage
  localStorage.setItem("musicQuizRoom", roomCode);
  localStorage.setItem("musicQuizNickname", userNickname);
  localStorage.setItem("musicQuizIsHost", Host);
});

socket.on("game-started", ({ roomCode }) => {
  window.location.href = `game.html?roomCode=${roomCode}&nickname=${currentUserNickname}`;
});

socket.on("error-nickname-taken", () => {
  errorDiv.textContent = `This nickname is alredy taken`;
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

  // Update player count
  const playerCount = document.getElementById("playerCount");
  if (playerCount) {
    playerCount.textContent = players.length;
  }
});

socket.on("playlist-preview", ({ tracks, playlistName }) => {
  const previewContainer = document.getElementById("playlistTracksPreview");
  previewContainer.hidden = false;

  // Create tracks list container
  let tracksList = previewContainer.querySelector(".preview-tracks-list");
  if (!tracksList) {
    previewContainer.innerHTML =
      '<h3>Playlist Preview</h3><div class="preview-tracks-list"></div>';
    tracksList = previewContainer.querySelector(".preview-tracks-list");
  } else {
    tracksList.innerHTML = "";
  }

  tracks.forEach((track) => {
    const trackElement = document.createElement("div");
    trackElement.className = "preview-track-item";
    trackElement.innerHTML = `
      <div class="track-name">${track.name}</div>
      <div class="track-artist">${track.artist}</div>
    `;
    tracksList.appendChild(trackElement);
  });

  // Update player count
  const playerCount = document.getElementById("playerCount");
  if (playerCount) {
    const players = document.querySelectorAll(".player-item");
    playerCount.textContent = players.length;
  }
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
        errorDiv.textContent = `Error with JSON: ${res.message}`;
        return;
      }
      const data = await res.json();
      if (!data.exists) {
        errorDiv.textContent = "Error with JSON";
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
    alert("You are not in the room");
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

// Автоматичне відновлення сесії при перезавантаженні
window.addEventListener("load", () => {
  const savedRoom = localStorage.getItem("musicQuizRoom");
  const savedNickname = localStorage.getItem("musicQuizNickname");

  if (savedRoom && savedNickname) {
    // Перевіряємо чи кімната ще існує
    fetch(`/api/rooms/${savedRoom}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.exists) {
          nameInputEl.value = savedNickname;
          roomCodeInput.value = savedRoom;
          joinRoom();
        } else {
          // Кімната не існує, очищаємо localStorage
          clearRoomData();
        }
      })
      .catch(() => clearRoomData());
  }

  const params = new URLSearchParams(window.location.search);
  const autoRoomCode = params.get("roomCode");
  const autoNickname = params.get("nickname");

  if (autoRoomCode && autoNickname) {
    nameInputEl.value = autoNickname;
    roomCodeInput.value = autoRoomCode;
    joinRoom();
  }
});

function clearRoomData() {
  localStorage.removeItem("musicQuizRoom");
  localStorage.removeItem("musicQuizNickname");
  localStorage.removeItem("musicQuizIsHost");
  body.classList.remove("active-lobby");
}

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

// Валідація для цифрових input
totalRoundsInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, "");
  if (e.target.value && parseInt(e.target.value) > 20) {
    e.target.value = "20";
  }
  if (e.target.value && parseInt(e.target.value) < 1) {
    e.target.value = "1";
  }
});

// Leave lobby button functionality
const leaveLobbyBtn = document.getElementById("leaveLobbyBtn");
if (leaveLobbyBtn) {
  leaveLobbyBtn.addEventListener("click", () => {
    const confirmed = confirm("You really want to leave?");
    if (confirmed) {
      clearRoomData();
      socket.disconnect();
      window.location.reload();
    }
  });
}

// Playlist Search Functionality
const searchPlaylistBtn = document.getElementById("searchPlaylistBtn");
const playlistSearchInput = document.getElementById("playlistSearchInput");
const searchResultsDiv = document.getElementById("searchResults");
let searchTimeout;

searchPlaylistBtn.addEventListener("click", () => {
  performPlaylistSearch();
});

playlistSearchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    performPlaylistSearch();
  }
});

// Debounced search on input
playlistSearchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const query = playlistSearchInput.value.trim();

  if (query.length < 2) {
    searchResultsDiv.innerHTML = "";
    searchResultsDiv.style.display = "none";
    return;
  }

  searchTimeout = setTimeout(() => {
    performPlaylistSearch();
  }, 500);
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-input-wrapper")) {
    searchResultsDiv.innerHTML = "";
    searchResultsDiv.style.display = "none";
  }
});

async function performPlaylistSearch() {
  const query = playlistSearchInput.value.trim();

  if (!query) {
    searchResultsDiv.innerHTML =
      "<p class='search-message'>Enter a search term</p>";
    searchResultsDiv.style.display = "flex";
    return;
  }

  searchResultsDiv.innerHTML =
    "<p class='search-message loading'>Searching...</p>";
  searchResultsDiv.style.display = "flex";

  try {
    const response = await fetch(
      `/api/search-playlists?q=${encodeURIComponent(query)}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search failed");
    }

    if (data.playlists.length === 0) {
      searchResultsDiv.innerHTML =
        "<p class='search-message'>No playlists found</p>";
      searchResultsDiv.style.display = "flex";
      return;
    }

    renderSearchResults(data.playlists);
  } catch (error) {
    console.error("Search error:", error);
    searchResultsDiv.innerHTML = `<p class='search-message error'>Error: ${error.message}</p>`;
    searchResultsDiv.style.display = "flex";
  }
}

function renderSearchResults(playlists) {
  searchResultsDiv.innerHTML = "";
  searchResultsDiv.style.display = "flex";

  playlists.forEach((playlist) => {
    const playlistCard = document.createElement("div");
    playlistCard.className = "playlist-card";
    playlistCard.innerHTML = `
      <div class="playlist-image-container">
        ${
          playlist.image
            ? `<img src="${playlist.image}" alt="${playlist.name}" class="playlist-image">`
            : `<div class="playlist-no-image">♫</div>`
        }
      </div>
      <div class="playlist-info">
        <div class="playlist-name">${playlist.name}</div>
        <div class="playlist-details">
          <span class="playlist-owner">by ${playlist.owner}</span>
          <span class="playlist-tracks">${playlist.tracks} tracks</span>
        </div>
      </div>
      <button class="btn-select" data-id="${playlist.id}" data-name="${
      playlist.name
    }">Select</button>
    `;

    const selectBtn = playlistCard.querySelector(".btn-select");
    selectBtn.addEventListener("click", () => {
      selectPlaylist(playlist.id, playlist.name);
    });

    searchResultsDiv.appendChild(playlistCard);
  });
}

function selectPlaylist(playlistId, playlistName) {
  document.getElementById("playlistIdInput").value = playlistId;
  searchResultsDiv.innerHTML = `<p class='search-message success'>Selected: ${playlistName}</p>`;
  playlistSearchInput.value = "";

  // Сховати dropdown через 2 секунди
  setTimeout(() => {
    searchResultsDiv.innerHTML = "";
    searchResultsDiv.style.display = "none";
  }, 2000);

  // Автоматично застосувати вибраний плейлист
  if (isHost) {
    document.getElementById("currentPlaylistName").textContent = "Loading...";
    socket.emit("change-playlist", {
      roomCode: currentRoom,
      playlistId: playlistId,
      playlistName: playlistName,
    });
  }
}

// Tab switching functionality
document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-btn");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.tab;

      // Remove active class from all tabs and contents
      document
        .querySelectorAll(".tab-btn")
        .forEach((btn) => btn.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((content) => content.classList.remove("active"));

      // Add active class to clicked tab and corresponding content
      button.classList.add("active");
      document
        .getElementById(`${targetTab}-tab-content`)
        .classList.add("active");

      // Clear search results when switching tabs
      if (targetTab === "manual") {
        searchResultsDiv.innerHTML = "";
        playlistSearchInput.value = "";
      }
    });
  });
});
