# 🎵 Music Quiz

**Music Quiz** is an interactive real-time web game where players compete to guess the artist from short audio clips. The game integrates with Spotify to generate questions dynamically.

🚀 **Play Online:** [https://muziks.fly.dev/](https://muziks.fly.dev/)

> **⚠️ IMPORTANT: Cold Start Warning**
> This demo is hosted on the **Fly.io free tier**. If the application has not been used recently, the server goes into "sleep mode".
> **Please wait up to 60 seconds** for the website to load the first time while the server wakes up. Once it is awake, everything works instantly!

## 🎮 How It Works

1. **Lobby:** One player creates a room and becomes the Host. Others join using a unique room code.
2. **Settings:** The Host can choose a playlist (or paste a Spotify playlist URL/ID), set the number of rounds, and adjust the time limit.
   > **Note:** You must use **user-created playlists**. Official playlists curated by Spotify (e.g., "Today's Top Hits") are not supported.
3. **Game:** All players listen to a 30-second track preview simultaneously.
4. **Answer:** Guess the correct artist from 4 options. Speed matters!.
5. **Chat:** Chat with friends in real-time during the game.

## ✨ Key Features

* **Real-time Multiplayer:** Game state synchronization across all players using `Socket.io`.
* **Spotify Integration:**
    * Support for public **user-created** playlists (via ID or URL).
    * **⚠️ Limitation:** Official Spotify-curated playlists are NOT supported.
    * Built-in genre presets (Rock, 90s, Pop, Hip Hop).
    * Track previews in the lobby.
* **Room Customization (Host only):**
    * Adjustable round duration (5-30 seconds).
    * Customizable total number of rounds.
    * Game flow control (Start, Next Round, Play Again).
* **Scoring System:**
    * **+10 points** for the fastest correct answer.
    * **+8 points** for the second fastest.
    * **+5 points** for subsequent correct answers.
* **Reconnection:** Players can rejoin the game and restore their score/status if they accidentally refresh or disconnect.
* **Live Chat:** Global chat for room participants.

## 🛠 Tech Stack

### Backend
* **Node.js & Express:** Core server application.
* **Socket.io:** Real-time bidirectional event-based communication (rooms, chat, timers, game sync).
* **Spotify Web API Node:** Fetching playlist and track metadata.
* **Spotify Preview Finder:** Retrieving 30-second audio previews for tracks.

### Frontend
* **HTML5 / CSS3:** Responsive UI for the lobby and game interface.
* **Vanilla JavaScript:** Client-side logic, socket event handling, and DOM manipulation.

### Deployment
* **Fly.io:** Application hosting.

## 💻 Local Development

If you want to run this project locally:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/guitobi/music-quiz-.git](https://github.com/guitobi/music-quiz-.git)
    cd music-quiz
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root directory and add your Spotify API credentials (required for the game to function):
    ```env
    SPOTIFY_CLIENT_ID=your_spotify_client_id
    SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    ```
    *You can obtain these keys from the [Spotify for Developers Dashboard](https://developer.spotify.com/dashboard).*

4.  **Start the server:**
    ```bash
    nodemon server.js
    ```

5.  **Open the application:**
    Go to `http://localhost:3000` in your browser.
