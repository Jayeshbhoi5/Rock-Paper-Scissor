// src/App.js
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, remove, push, get } from 'firebase/database';
import './App.css';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAw5ZcAPvj5ItFQ8QS3Jvx0eBsz7wVIzJE",
  authDomain: "rpscc-a7d45.firebaseapp.com",
  projectId: "rpscc-a7d45",
  storageBucket: "rpscc-a7d45.firebasestorage.app",
  messagingSenderId: "865131723222",
  appId: "1:865131723222:web:e557745ec1bc9a9dfccc77",
  measurementId: "G-EJSBN82JVR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const CHOICES = ['rock', 'paper', 'scissors'];
const MAX_PLAYERS = 6;

function App() {
  const [gameId, setGameId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState('waiting'); // waiting, playing, finished
  const [playerChoice, setPlayerChoice] = useState(null);
  const [results, setResults] = useState({});
  const [winner, setWinner] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Join or create a game
  const joinGame = async () => {
    if (!playerName.trim()) {
      setErrorMessage('Please enter a name');
      return;
    }
    
    try {
      if (!gameId) {
        // Create new game
        const newGameId = Math.random().toString(36).substring(2, 8);
        setGameId(newGameId);
        await set(ref(database, `games/${newGameId}/state`), 'waiting');
        createNewPlayer(newGameId);
      } else {
        // Join existing game
        // Check if game exists
        const gameSnapshot = await get(ref(database, `games/${gameId}`));
        
        if (!gameSnapshot.exists()) {
          setErrorMessage(`Game with ID ${gameId} doesn't exist`);
        } else {
          const game = gameSnapshot.val();
          if (game.players && Object.keys(game.players).length >= MAX_PLAYERS) {
            setErrorMessage(`Game is full (max ${MAX_PLAYERS} players)`);
          } else if (game.state !== 'waiting') {
            setErrorMessage('Game already in progress');
          } else {
            createNewPlayer(gameId);
          }
        }
      }
    } catch (error) {
      console.error("Error joining game:", error);
      setErrorMessage(`Error joining game: ${error.message}`);
    }
  };

  const createNewPlayer = async (gameId) => {
    try {
      const newPlayerId = push(ref(database, `games/${gameId}/players`)).key;
      await set(ref(database, `games/${gameId}/players/${newPlayerId}`), {
        name: playerName,
        choice: null,
        ready: false
      });
      
      setPlayerId(newPlayerId);
      setErrorMessage('');
    } catch (error) {
      console.error("Error creating player:", error);
      setErrorMessage(`Error creating player: ${error.message}`);
    }
  };

  // Make a choice
  const makeChoice = async (choice) => {
    try {
      await set(ref(database, `games/${gameId}/players/${playerId}/choice`), choice);
      await set(ref(database, `games/${gameId}/players/${playerId}/ready`), true);
    } catch (error) {
      console.error("Error making choice:", error);
      setErrorMessage(`Error making choice: ${error.message}`);
    }
  };

  // Start a new round
  const startNewRound = async () => {
    try {
      // Reset all player choices and ready states
      const promises = players.map(player => {
        return set(ref(database, `games/${gameId}/players/${player.id}`), {
          ...player,
          choice: null,
          ready: false
        });
      });
      
      await Promise.all(promises);
      await set(ref(database, `games/${gameId}/state`), 'playing');
      
      setResults({});
      setWinner(null);
    } catch (error) {
      console.error("Error starting new round:", error);
      setErrorMessage(`Error starting new round: ${error.message}`);
    }
  };

  // Leave game
  const leaveGame = async () => {
    if (gameId && playerId) {
      try {
        // Remove this player
        await remove(ref(database, `games/${gameId}/players/${playerId}`));
        
        // Check if this was the last player
        const playersSnapshot = await get(ref(database, `games/${gameId}/players`));
        
        if (!playersSnapshot.exists() || Object.keys(playersSnapshot.val()).length === 0) {
          // Only remove the game if no players are left
          await remove(ref(database, `games/${gameId}`));
        }
      } catch (error) {
        console.error("Error leaving game:", error);
      }
    }
    
    resetGame();
  };

  const resetGame = () => {
    setGameId(null);
    setPlayerId('');
    setPlayers([]);
    setGameState('waiting');
    setPlayerChoice(null);
    setResults({});
    setWinner(null);
    setErrorMessage('');
  };

  // Listen for game updates
  useEffect(() => {
    if (!gameId) return;

    const gameRef = ref(database, `games/${gameId}`);
    let unsubscribe;
    
    try {
      unsubscribe = onValue(gameRef, (snapshot) => {
        if (!snapshot.exists()) {
          if (playerId) {  // Only show error if we were already in a game
            setErrorMessage('Game no longer exists');
            resetGame();
          }
          return;
        }

        const game = snapshot.val();
        setGameState(game.state);

        // Update players
        const playersData = game.players || {};
        const playersList = Object.entries(playersData).map(([id, data]) => ({
          id,
          name: data.name,
          choice: data.choice,
          ready: data.ready
        }));
        setPlayers(playersList);

        // Update current player's choice
        if (playerId && playersData[playerId]) {
          setPlayerChoice(playersData[playerId].choice);
        }

        // Check if all players made their choices
        const allPlayersReady = playersList.length >= 2 && 
          playersList.every(player => player.ready);

        if (allPlayersReady && game.state === 'playing') {
          determineWinner(playersList);
          set(ref(database, `games/${gameId}/state`), 'finished');
        }
      }, (error) => {
        console.error("Firebase error:", error);
        setErrorMessage(`Database error: ${error.message}`);
      });
    } catch (error) {
      console.error("Error in onValue:", error);
      setErrorMessage(`Error connecting to game: ${error.message}`);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [gameId, playerId]);

  // Determine winner logic
  const determineWinner = (playersList) => {
    if (playersList.length < 2) return;

    const gameResults = {};
    let roundWinner = null;
    
    // For simplicity in this mini project:
    // Each player gets a point for each player they beat
    playersList.forEach(player => {
      if (!player.choice) return;
      
      gameResults[player.id] = {
        name: player.name,
        choice: player.choice,
        score: 0
      };
    });

    // Calculate scores
    for (let i = 0; i < playersList.length; i++) {
      const player1 = playersList[i];
      
      for (let j = i + 1; j < playersList.length; j++) {
        const player2 = playersList[j];
        
        if (!player1.choice || !player2.choice) continue;
        
        const winner = getWinner(player1.choice, player2.choice);
        
        if (winner === 'player1') {
          gameResults[player1.id].score++;
        } else if (winner === 'player2') {
          gameResults[player2.id].score++;
        }
        // Ties don't add points
      }
    }
    
    // Find player with highest score
    let highestScore = -1;
    let topPlayers = [];
    
    Object.entries(gameResults).forEach(([id, data]) => {
      if (data.score > highestScore) {
        highestScore = data.score;
        topPlayers = [id];
      } else if (data.score === highestScore) {
        topPlayers.push(id);
      }
    });
    
    if (topPlayers.length === 1) {
      roundWinner = gameResults[topPlayers[0]].name;
    } else if (highestScore === 0) {
      roundWinner = "It's a tie! No points awarded.";
    } else {
      roundWinner = `Tie between: ${topPlayers.map(id => gameResults[id].name).join(', ')}`;
    }
    
    setResults(gameResults);
    setWinner(roundWinner);
  };

  // Helper to determine winner between two choices
  const getWinner = (choice1, choice2) => {
    if (choice1 === choice2) return 'tie';
    
    if (
      (choice1 === 'rock' && choice2 === 'scissors') ||
      (choice1 === 'paper' && choice2 === 'rock') ||
      (choice1 === 'scissors' && choice2 === 'paper')
    ) {
      return 'player1';
    }
    
    return 'player2';
  };

  // Game lobby view
  if (!playerId) {
    return (
      <div className="app">
        <h1>AI-Powered Rock Paper Scissors</h1>
        <div className="join-game">
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Game ID (optional)"
            value={gameId || ''}
            onChange={(e) => setGameId(e.target.value)}
          />
          <button onClick={joinGame}>
            {gameId ? 'Join Game' : 'Create Game'}
          </button>
          {errorMessage && <p className="error">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  // Game play view
  return (
    <div className="app">
      <h1>Rock Paper Scissors</h1>
      
      <div className="game-info">
        <p>Game ID: <strong>{gameId}</strong> (Share this with friends to join)</p>
        <p>Players: {players.length}/{MAX_PLAYERS}</p>
        <p>Status: {gameState}</p>
        {errorMessage && <p className="error">{errorMessage}</p>}
      </div>
      
      <div className="players-list">
        <h2>Players</h2>
        <ul>
          {players.map(player => (
            <li key={player.id} className={player.id === playerId ? 'current-player' : ''}>
              {player.name} 
              {player.ready && gameState === 'playing' && <span> (Ready)</span>}
              {player.id === playerId && ' (You)'}
              {gameState === 'finished' && results[player.id] && 
                <span> - Chose {results[player.id].choice} (Points: {results[player.id].score})</span>
              }
            </li>
          ))}
        </ul>
      </div>
      
      {gameState === 'waiting' && players.length >= 2 && playerId === players[0]?.id && (
        <div className="game-controls">
          <button onClick={startNewRound}>Start Game</button>
        </div>
      )}
      
      {gameState === 'playing' && !playerChoice && (
        <div className="choice-buttons">
          <h3>Make your choice:</h3>
          <div className="choices">
            {CHOICES.map(choice => (
              <button 
                key={choice} 
                onClick={() => makeChoice(choice)}
                className="choice-btn"
              >
                {choice.charAt(0).toUpperCase() + choice.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {gameState === 'playing' && playerChoice && (
        <div className="waiting">
          <h3>You chose: {playerChoice}</h3>
          <p>Waiting for other players...</p>
        </div>
      )}
      
      {gameState === 'finished' && (
        <div className="results">
          <h2>Round Results</h2>
          {winner && <h3>Winner: {winner}</h3>}
          
          <div className="player-choices">
            {Object.values(results).map((player, index) => (
              <div key={index} className="player-result">
                <p>{player.name}: {player.choice}</p>
                <p>Score: {player.score}</p>
              </div>
            ))}
          </div>
          
          {playerId === players[0]?.id && (
            <button onClick={startNewRound} className="play-again">
              Play Again
            </button>
          )}
        </div>
      )}
      
      <div className="footer">
        <button onClick={leaveGame} className="leave-btn">
          Leave Game
        </button>
      </div>
    </div>
  );
}

export default App;