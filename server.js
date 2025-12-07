import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import SpotifyWebApi from "spotify-web-api-node";
import spotifyPreviewFinder from "spotify-preview-finder";
import SpotifyWebApi from  'spotify-web-api-node'
import spotifyPreviewFinder from 'spotify-preview-finder';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const SpotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

const rooms = {};

app.post("/api/rooms", (req, res) => {
  const playerName = req.body.playerName;
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms[roomCode] = {
    gameIsStarted: false,
    players: {},
    playlistID: process.env.SPOTIFY_PLAYLIST_ID,
    playlistName: "Rock of all time",
    roundDuration: 15,
    totalRounds: 5,
  };
  res.json({ roomCode: roomCode });
});

app.get("/api/rooms/:roomCode", (req, res) => {
  const roomCode = req.params.roomCode;
  if (rooms[roomCode]) {
    res.json({ exists: true });
  } else {
    res.status(404).json({ exists: false, message: "Room not found" });
  }
});

// endpoint for search playlists
app.get("/api/search-playlists", async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || query.trim() === "") {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Перевіряємо чи є токен, якщо ні - отримуємо новий
    if (!SpotifyApi.getAccessToken()) {
      await initializeSpotify();
    }

    const searchResult = await SpotifyApi.searchPlaylists(query, {
      limit: 10,
    });

    // Перевіряємо чи є результати
    if (
      !searchResult.body ||
      !searchResult.body.playlists ||
      !searchResult.body.playlists.items
    ) {
      return res.json({ playlists: [] });
    }

    const playlists = searchResult.body.playlists.items.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      owner: playlist.owner.display_name,
      tracks: playlist.tracks.total,
      image:
        playlist.images && playlist.images[0] ? playlist.images[0].url : null,
      description: playlist.description || "",
    }));

    res.json({ playlists });
  } catch (err) {
    console.error("Помилка пошуку плейлистів:", err);
    console.error("Деталі помилки:", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", err.response.body);
    }
    res.status(500).json({
      error: "Failed to search playlists",
      details: err.message,
    });
  }
});

io.on("connection", (socket) => {
  console.log("User is connected");

  socket.on("message", ({ userNickname, roomCode, text }) => {
    io.to(roomCode).emit("message", { userNickname, text });
  });

  socket.on("join-room", ({ userNickname, roomCode }) => {
    socket.join(roomCode);

    if (
      !rooms[roomCode] ||
      rooms[roomCode].gameIsStarted ||
      rooms[roomCode].isLobbyLocked
    ) {
      socket.emit("error-game-in-progress");
      return;
    }

    if (!rooms[roomCode].disconnectedPlayers)
      rooms[roomCode].disconnectedPlayers = [];

    if (
      Object.values(rooms[roomCode].players).some(
        (p) => p.name === userNickname
      )
    ) {
      socket.emit("error-nickname-taken");
      return;
    }

    const index = rooms[roomCode].disconnectedPlayers.findIndex(
      (p) => p.name === userNickname
    );

    let score;
    let isHost;

    if (index !== -1) {
      score = rooms[roomCode].disconnectedPlayers[index].score;
      isHost = rooms[roomCode].disconnectedPlayers[index].isHost;
      rooms[roomCode].disconnectedPlayers.splice(index, 1);
    } else {
      score = 0;
      isHost = Object.keys(rooms[roomCode].players).length === 0;
    }

    rooms[roomCode].players[socket.id] = { name: userNickname, score, isHost };
    socket.room = roomCode;

    if (rooms[roomCode].gameIsStarted) {
      socket.emit("game-started", {
        userNickname: userNickname,
        roomCode: roomCode,
      });
    } else {
      socket.emit("room-joined", {
        userNickname: userNickname,
        roomCode,
        Host: isHost,
      });
    }

    broadcastPlayersUpdate(roomCode);
  });

  socket.on("rejoin-room", ({ userNickname, roomCode }) => {
    socket.join(roomCode);

    if (!rooms[roomCode].disconnectedPlayers)
      rooms[roomCode].disconnectedPlayers = [];

    const disIndex = rooms[roomCode].disconnectedPlayers.findIndex(
      (p) => p.name === userNickname
    );

    let score;
    let isHost;

    if (disIndex !== -1) {
      score = rooms[roomCode].disconnectedPlayers[disIndex].score;
      isHost = rooms[roomCode].disconnectedPlayers[disIndex].isHost;
      rooms[roomCode].disconnectedPlayers.splice(disIndex, 1);
    } else {
      const playerIndex = Object.entries(rooms[roomCode].players).filter(
        ([key, value]) => value.name === userNickname
      );

      if (playerIndex.length !== 0) {
        const foundEntry = playerIndex[0];
        score = foundEntry[1].score;
        isHost = foundEntry[1].isHost;
        delete rooms[roomCode].players[foundEntry[0]];
      } else {
        score = 0;
        isHost = Object.keys(rooms[roomCode].players).length === 0;
      }
    }

    rooms[roomCode].players[socket.id] = { name: userNickname, score, isHost };
    socket.room = roomCode;

    if (isHost && rooms[roomCode].hostPromotionTimer)
      clearTimeout(rooms[roomCode].hostPromotionTimer);
    if (rooms[socket.room].roomTimeoutTimer)
      clearTimeout(rooms[socket.room].roomTimeoutTimer);

    // Якщо гра йде і раунд НЕ закінчився - синхронізуємо стан гри
    if (rooms[roomCode].gameIsStarted && !rooms[roomCode].roundOverSent) {
      // Обчислюємо скільки часу залишилось
      const timeLeft = rooms[roomCode].roundStartTime
        ? Math.max(
            0,
            rooms[roomCode].roundDuration -
              Math.floor((Date.now() - rooms[roomCode].roundStartTime) / 1000)
          )
        : rooms[roomCode].roundDuration;

      const timeElapsed = rooms[roomCode].roundDuration - timeLeft;
      io.to(socket.id).emit("sync-game-state", {
        currentRound: rooms[roomCode].currentRound,
        totalRounds: rooms[roomCode].totalRounds,
        curQuestion: rooms[roomCode].currentQuestion,
        timeLeft: timeLeft,
        audioUrl: rooms[roomCode].currentQuestion?.url,
        timeElapsed: timeElapsed,
      });
    }
    // Якщо гра йде і раунд ЗАКІНЧИВСЯ - відправляємо результати раунду
    else if (rooms[roomCode].gameIsStarted && rooms[roomCode].roundOverSent) {
      const players = rooms[roomCode].players;
      const results = Object.keys(players).map((sockId) => {
        const player = players[sockId];
        const playerResult = rooms[roomCode].roundResults[player.name] || {
          hasAnswered: false,
          isCorrectAnswer: false,
        };
        return {
          name: player.name,
          score: player.score,
          isCorrectAnswer: playerResult.isCorrectAnswer,
        };
      });
      io.to(socket.id).emit("round-over", {
        results: results,
        correctAnswer: rooms[roomCode].currentQuestion,
      });
    }

    socket.emit("room-joined", {
      userNickname: userNickname,
      roomCode,
      Host: isHost,
    });

    broadcastPlayersUpdate(roomCode);
  });

  socket.on("disconnect", () => {
    if (!rooms[socket.room] || !rooms[socket.room].players[socket.id]) return;

    if (!rooms[socket.room]) return;
    if (!rooms[socket.room].disconnectedPlayers) {
      rooms[socket.room].disconnectedPlayers = [];
    }
    rooms[socket.room].disconnectedPlayers.push({
      ...rooms[socket.room].players[socket.id],
    });

    const wasHost = rooms[socket.room].players[socket.id].isHost;

    delete rooms[socket.room].players[socket.id];

    if (wasHost && Object.keys(rooms[socket.room].players).length > 0) {
      rooms[socket.room].hostPromotionTimer = setTimeout(() => {
        if (!rooms[socket.room]) return;
        if (Object.keys(rooms[socket.room].players).length === 0) return;

        const newHostSocketId = Object.keys(rooms[socket.room].players)[0];
        if (wasHost && newHostSocketId) {
          rooms[socket.room].players[newHostSocketId].isHost = true;
          io.to(newHostSocketId).emit("new-host");
        }
      }, 5000);
    }

    broadcastPlayersUpdate(socket.room);

    if (
      !rooms[socket.room].gameIsStarted &&
      Object.keys(rooms[socket.room].players).length === 0
    ) {
      // таймер для видалення кімнати (щоб вона випадково не видалилась якшо гравець просто рефрешить сторінку)
      if (rooms[socket.room].roomTimeoutTimer)
        clearTimeout(rooms[socket.room].roomTimeoutTimer);

      rooms[socket.room].roomTimeoutTimer = setTimeout(() => {
        if (
          !rooms[socket.room].gameIsStarted &&
          Object.keys(rooms[socket.room].players).length === 0
        )
          delete rooms[socket.room];
      }, 15000);
    }
  });

  socket.on("start-game", ({ roomCode }) => {
    if (!rooms[roomCode] || !rooms[roomCode].players[socket.id]) return;

    const player = rooms[roomCode].players[socket.id];
    if (!player.isHost) return;
    if (!rooms[roomCode].disconnectedPlayers) {
      rooms[roomCode].disconnectedPlayers = [];
    }
    Object.values(rooms[roomCode].players).forEach((player) => {
      rooms[roomCode].disconnectedPlayers.push(player);
    });
    rooms[roomCode].players = {};
    rooms[roomCode].isLobbyLocked = true;
    io.to(roomCode).emit("game-started", { roomCode: roomCode });
    // startNewGame(roomCode, socket);
  });

  socket.on("start-round", async (roomCode) => {
    if (!rooms[roomCode] || !rooms[roomCode].players[socket.id]) return;

    const player = rooms[roomCode].players[socket.id];

    if (!player || !player.isHost) return;

    // Перевіряємо чи гра вже почалась
    if (
      rooms[roomCode].gameIsStarted &&
      rooms[roomCode].questionDeck &&
      rooms[roomCode].questionDeck.length > 0
    ) {
      // Якщо гра вже йде - просто стартуємо наступний раунд
      await startNewRound(roomCode);
    } else {
      // Якщо гра не почалась - стартуємо нову гру
      await startNewGame(roomCode, socket);
    }
  });

  socket.on("submit-button", ({ roomCode, nickname, answer }) => {
    if (!roomCode || !nickname || !answer || !rooms[roomCode]) return;

    if (!rooms[roomCode].roundResults) rooms[roomCode].roundResults = {};
    if (rooms[roomCode].roundResults[nickname]) return;

    const players = rooms[roomCode].players;
    const isCorrect = answer === rooms[roomCode].currentCorrectAnswer;

    const playerEntry = Object.values(players).find((p) => p.name === nickname);
    if (playerEntry && isCorrect) {
      if (rooms[roomCode].answeredPlayers.length === 0) {
        playerEntry.score += 10;
      } else if (rooms[roomCode].answeredPlayers.length === 1) {
        playerEntry.score += 8;
      } else {
        playerEntry.score += 5;
      }
      rooms[roomCode].answeredPlayers.push(nickname);
    }

    rooms[roomCode].roundResults[nickname] = {
      hasAnswered: true,
      isCorrectAnswer: isCorrect,
    };

    if (
      Object.keys(rooms[roomCode].roundResults).length ===
      Object.keys(players).length
    ) {
      if (rooms[roomCode].roundOverSent) return;
      rooms[roomCode].roundOverSent = true;

      const results = Object.keys(players).map((sockId) => {
        const player = players[sockId];
        const playerResult = rooms[roomCode].roundResults[player.name] || {
          hasAnswered: false,
          isCorrectAnswer: false,
        };
        return {
          name: player.name,
          score: player.score,
          isCorrectAnswer: playerResult.isCorrectAnswer,
        };
      });

      broadcastPlayersUpdate(roomCode);
      io.to(roomCode).emit("round-over", {
        results: results,
        correctAnswer: rooms[roomCode].currentQuestion,
      });
    }
  });

  socket.on("play-again", async ({ roomCode }) => {
    if (!rooms[roomCode] || !rooms[roomCode].players[socket.id]) return;

    const player = rooms[roomCode].players[socket.id];
    if (!player.isHost) return;

    if (!rooms[roomCode].disconnectedPlayers) {
      rooms[roomCode].disconnectedPlayers = [];
    }
    Object.values(rooms[roomCode].players).forEach((player) => {
      rooms[roomCode].disconnectedPlayers.push(player);
    });
    rooms[roomCode].players = {};
    rooms[roomCode].isLobbyLocked = true;
    io.to(roomCode).emit("game-started", { roomCode: roomCode });
    // await startNewGame(roomCode, socket);
  });

  socket.on("next-round", async (roomCode) => {
    await startNewRound(roomCode);
  });

  socket.on("change-playlist", ({ roomCode, playlistId, playlistName }) => {
    if (!rooms[roomCode] || !rooms[roomCode].players[socket.id]) return;

    const player = rooms[roomCode].players[socket.id];
    if (!player || !player.isHost) return;

    rooms[roomCode].playlistID = playlistId;
    rooms[roomCode].playlistName = playlistName;
    loadPlaylistPreview(roomCode, playlistId);
    io.to(roomCode).emit("playlist-updated", {
      playlistId,
      playlistName,
      hostId: socket.id,
    });
  });

  // обробник для кнопки return to lobby
  socket.on("return-to-lobby", ({ roomCode }) => {
    if (!rooms[roomCode]) return;

    const player = rooms[roomCode].players[socket.id];

    if (!player.isHost) return;

    // скидання стану кімнати
    rooms[roomCode].gameIsStarted = false;
    rooms[roomCode].isLobbyLocked = false;
    rooms[roomCode].currentRound = 0;
    rooms[roomCode].questionDeck = [];
    rooms[roomCode].roundResults = {};

    Object.values(rooms[roomCode].players).forEach(
      (player) => (player.score = 0)
    );

    io.to(roomCode).emit("lobby-redirect", { roomCode });
  });

  socket.on("duration-change", ({ roundDuration, roomCode }) => {
    if (!rooms[roomCode].players[socket.id].isHost) return;
    rooms[roomCode].roundDuration = roundDuration;
  });

  socket.on("total-rounds-change", ({ totalRounds, roomCode }) => {
    if (!rooms[roomCode].players[socket.id].isHost) return;
    rooms[roomCode].totalRounds = totalRounds;
  });
});

// функція для перших 10 пісень у лобі
const loadPlaylistPreview = async (roomCode, playlistId) => {
  try {
    const playlist = await SpotifyApi.getPlaylist(playlistId);
    const tracks = playlist.body.tracks.items.slice(0, 10).map((item) => ({
      name: item.track.name,
      artist: item.track.artists[0].name,
    }));

    io.to(roomCode).emit("playlist-preview", {
      tracks,
      playlistName: playlist.body.name,
    });
  } catch (err) {
    console.error("Error loading playlist preview:", err);
    io.to(roomCode).emit("error-message", "Failed to load playlist preview");
  }
};

const startNewRound = async (roomCode) => {
  try {
    rooms[roomCode].currentRound++;

    if (rooms[roomCode].currentRound > rooms[roomCode].totalRounds) {
      rooms[roomCode].gameIsStarted = false;
      rooms[roomCode].isLobbyLocked = false;
      rooms[roomCode].answeredPlayers = [];

      const sortedPlayers = Object.values(rooms[roomCode].players).sort(
        (a, b) => b.score - a.score
      );

      io.to(roomCode).emit("game-over", { finalScores: sortedPlayers });
    } else {
      rooms[roomCode].answeredPlayers = [];
      const nextQuestion = rooms[roomCode].questionDeck.pop();
      rooms[roomCode].currentCorrectAnswer = nextQuestion.artistName;
      rooms[roomCode].currentQuestion = nextQuestion;
      rooms[roomCode].roundStartTime = Date.now(); // Зберігаємо час початку раунду

      io.to(roomCode).emit("new-round", {
        question: rooms[roomCode].currentQuestion,
        currentRound: rooms[roomCode].currentRound,
        totalRounds: rooms[roomCode].totalRounds,
        url: nextQuestion.url,
        duration: rooms[roomCode].roundDuration,
      });

      rooms[roomCode].roundOverSent = false;
      rooms[roomCode].roundResults = {};

      if (rooms[roomCode].currentTimer)
        clearTimeout(rooms[roomCode].currentTimer);

      rooms[roomCode].currentTimer = setTimeout(() => {
        if (rooms[roomCode].roundOverSent) return;
        rooms[roomCode].roundOverSent = true;

        const players = rooms[roomCode].players;
        const results = rooms[roomCode].roundResults;
        //  масив який буде відправлений всім клієнтам
        const infoToSend = Object.keys(players).map((sockId) => {
          const player = players[sockId];
          const playerResult = results[player.name] || {
            // за нікнеймом
            hasAnswered: false,
            isCorrectAnswer: false,
          };

          return {
            name: player.name,
            score: player.score,
            isCorrectAnswer: playerResult.isCorrectAnswer,
          };
        });

        io.to(roomCode).emit("round-over", {
          results: infoToSend,
          correctAnswer: rooms[roomCode].currentQuestion,
        });
      }, rooms[roomCode].roundDuration * 1000);
    }
  } catch (err) {
    console.error("Критична помилка в start-round:", err);
    io.to(roomCode).emit(
      "error-message",
      "Сталась помилка. Перезапустіть гру."
    );
    console.error("Помилка генерації питання:", err.message);
    if (err.response) {
      console.error("Status code:", err.response.status);
      console.error("Response data:", err.response.data);
    }
  }
};

const startNewGame = async (roomCode, socket) => {
  let questionPromises = [];
  const player = rooms[roomCode].players[socket.id];

  if (!player || !player.isHost) return;

  rooms[roomCode].gameIsStarted = true;
  rooms[roomCode].currentRound = 0;
  // rooms[roomCode].totalRounds = 5;
  Object.values(rooms[roomCode].players).forEach(
    (player) => (player.score = 0)
  );
  broadcastPlayersUpdate(roomCode);

  if (rooms[roomCode].currentTimer) clearTimeout(rooms[roomCode].currentTimer);

  rooms[roomCode].questionDeck = [];

  io.to(roomCode).emit("loading-question", roomCode);

  for (let i = 0; i < rooms[roomCode].totalRounds; i++) {
    let newQuestion = buildSingleQuestion(roomCode);
    // if (!newQuestion) {
    //     socket.emit('error-message', `Сталась помилка з генерацією питань, перезапустіть гру!`)
    //     return;
    // } else {
    questionPromises.push(newQuestion);

    // rooms[roomCode].questionDeck.push(newQuestion);
    // }
  }
  const allPromises = await Promise.all(questionPromises);
  const validPromises = allPromises.filter((item) => item !== null);

  rooms[roomCode].questionDeck = validPromises;

  if (rooms[roomCode].questionDeck.length === 0) {
    socket.emit(
      "error-message",
      `Сталась помилка з генерацією питань, перезапустіть гру!`
    );
    return;
  }

  await startNewRound(roomCode);
};

const getNames = (players) => Object.values(players);

const broadcastPlayersUpdate = (roomCode) => {
  io.to(roomCode).emit("players-update", getNames(rooms[roomCode].players));
};

const generateQuestion = async (roomCode) => {
  try {
    const playlist = await SpotifyApi.getPlaylist(rooms[roomCode].playlistID);

    if (
      !playlist.body ||
      !playlist.body.tracks ||
      !playlist.body.tracks.items
    ) {
      throw new Error("Плейлист порожній або має неправильну структуру");
    }

    const tracks = playlist.body.tracks.items
      .filter((item) => {
        if (!item || !item.track) return false;
        if (!item.track.name) return false;
        if (!item.track.artists || item.track.artists.length === 0)
          return false;
        if (!item.track.artists[0].name) return false;

        return true;
      })
      .map((item) => ({
        name: item.track.name,
        artist: item.track.artists[0].name,
      }));

    console.log(`Знайдено ${tracks.length} валідних треків у плейлисті`);

    if (tracks.length === 0) {
      throw new Error("У плейлисті немає валідних треків");
    }

    const tracksByArtist = new Map();
    for (const track of tracks) {
      if (!tracksByArtist.has(track.artist)) {
        tracksByArtist.set(track.artist, track);
      }
    }
    const uniqueTracks = Array.from(tracksByArtist.values());

    console.log(`Знайдено ${uniqueTracks.length} унікальних виконавців`);

    if (uniqueTracks.length < 4) {
      throw new Error(
        `У плейлисті недостатньо унікальних виконавців (потрібно мінімум 4, знайдено ${uniqueTracks.length})`
      );
    }

    const fourTracks = shuffle(uniqueTracks).slice(0, 4);
    const correctTrack = fourTracks[0];
    const options = shuffle(fourTracks.map((t) => t.artist));

    return {
      trackName: correctTrack.name,
      artistName: correctTrack.artist,
      options: options,
    };
  } catch (err) {
    console.error("Помилка генерації питання:", err.message);
    console.error("Помилка генерації питання:", err.message);
    if (err.response) {
      console.error("Status code:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

const buildSingleQuestion = async (roomCode) => {
  try {
    const question = await generateQuestion(roomCode);

    if (!question) {
      console.error(`Помилка евейту питтання (Nothing found)`);
      return null;
    }

    const query = `${question.trackName} ${question.artistName}`;
    const previewResult = await spotifyPreviewFinder(query, 1);

    if (
      question === null ||
      previewResult === null ||
      previewResult.results.length === 0 ||
      query === null
    ) {
      console.error(`Помилка побудови питтання (Nothing found)`);
      return null;
    }
    const previewUrl = previewResult.results[0].previewUrls[0];

    return {
      trackName: question.trackName,
      artistName: question.artistName,
      options: question.options,
      url: previewUrl,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
};

// допоміжна хуйня для перемішування
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const initializeSpotify = async () => {
  try {
    const cleintCrd = await SpotifyApi.clientCredentialsGrant();
    const accessToken = cleintCrd.body.access_token;
    SpotifyApi.setAccessToken(accessToken);
    console.log("Токен поновлено");
  } catch (err) {
    console.error(`Не вдалось дістати токен, ${err}`);
  }
};

// app.get('/api/rooms', (req, res) => {
//     const roomsAndPlayers = Object.keys(rooms).map(room => {
//         return { roomCode: room, playerCount: Object.values(rooms[room]).length };
//     });

//     res.json({
//         status: 'success',
//         data: {
//             rooms: {
//                 roomsAndPlayers: roomsAndPlayers
//             }
//         }
//     });
// });

const startServer = async () => {
  await initializeSpotify();
  setInterval(initializeSpotify, 3300000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server started on port ${port}`);
  });
};

startServer();
