const socket = io();
let myRoomCode = '';
let myId = '';
let myNickname = '';
let selectedCardIdx = null;
let toastTimeout = null;

function createRoom() {
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('roomInput').value = randomCode;
    joinRoom();
}

function joinRoom() {
    const rawInput = document.getElementById('roomInput').value;
    const nickInput = document.getElementById('nicknameInput').value;
    
    myNickname = (nickInput && nickInput.trim()) ? nickInput.trim() : '플레이어';

    if (rawInput) {
        myRoomCode = rawInput.trim().toUpperCase();
        socket.emit('joinRoom', { roomCode: myRoomCode, nickname: myNickname });
        
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('waiting-room').style.display = 'block';
        document.getElementById('display-room-code').innerText = myRoomCode;
        document.getElementById('board-room-code').innerText = myRoomCode;
    } else {
        alert('방 코드를 입력하세요!');
    }
}

function startGame() {
    socket.emit('startGame', myRoomCode);
}

function selectCard(idx, cardName) {
    selectedCardIdx = idx;
    
    if (cardName === 'rain') {
        socket.emit('playCard', { roomCode: myRoomCode, cardIdx: idx });
        selectedCardIdx = null;
        return;
    }

    const handCards = document.querySelectorAll('#my-hand .card');
    handCards.forEach((c, i) => {
        if (i === idx) c.classList.add('selected');
        else c.classList.remove('selected');
    });

    document.querySelectorAll('.pig-container').forEach(el => el.classList.add('target-selectable'));
}

function selectTargetPig(targetPlayerId, targetPigIdx) {
    if (selectedCardIdx === null) {
        alert('먼저 손에서 낼 카드를 선택하세요!');
        return;
    }

    socket.emit('playCard', { 
        roomCode: myRoomCode, 
        cardIdx: selectedCardIdx,
        targetPlayerId: targetPlayerId,
        targetPigIdx: parseInt(targetPigIdx, 10)
    });

    selectedCardIdx = null;
    document.querySelectorAll('.pig-container').forEach(el => el.classList.remove('target-selectable'));
}

function discardHand() {
    socket.emit('discardHand', { roomCode: myRoomCode });
    selectedCardIdx = null;
}

function renderPigElement(pig, ownerId, pigIdx) {
    const container = document.createElement('div');
    container.className = 'pig-container' + (selectedCardIdx !== null ? ' target-selectable' : '');
    
    container.onclick = (e) => {
        e.stopPropagation();
        selectTargetPig(ownerId, pigIdx);
    };

    const pigCard = document.createElement('div');
    pigCard.className = 'pig-card ' + (pig.isDirty ? 'pig-dirty' : 'pig-clean');
    container.appendChild(pigCard);

    if (pig.hasBarn) {
        const barn = document.createElement('div');
        barn.className = 'overlay-badge badge-barn';
        barn.innerText = '헛간';
        container.appendChild(barn);
    }
    if (pig.hasLightningRod) {
        const rod = document.createElement('div');
        rod.className = 'overlay-badge badge-rod';
        rod.innerText = '피뢰침';
        container.appendChild(rod);
    }
    if (pig.hasLock) {
        const lock = document.createElement('div');
        lock.className = 'overlay-badge badge-lock';
        lock.innerText = '잠금';
        container.appendChild(lock);
    }

    return container;
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const message = input.value;
    if (message && message.trim()) {
        socket.emit('sendChat', { roomCode: myRoomCode, message: message });
        input.value = '';
    }
}

// 상단 행동 알림 팝업 및 채팅 로그 출력
socket.on('actionNotice', (data) => {
    // 1. Toast 팝업 연출
    const toastElem = document.getElementById('action-toast');
    const toastText = document.getElementById('toast-text');
    toastText.innerText = data.message;

    toastElem.classList.remove('toast-hidden');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toastElem.classList.add('toast-hidden');
    }, 2200);

    // 2. 채팅창 행동 기록 추가
    const chatMsgs = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg action-log';
    msgDiv.innerText = data.message;
    chatMsgs.appendChild(msgDiv);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

socket.on('receiveChat', ({ sender, message }) => {
    const chatMsgs = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMsgs.appendChild(msgDiv);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

socket.on('gameStarted', () => {
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('game-board').style.display = 'flex';
});

socket.on('updateState', (room) => {
    myId = socket.id;
    
    document.getElementById('player-count').innerText = room.players.length;
    const playerListDiv = document.getElementById('waiting-player-list');
    playerListDiv.innerHTML = '';
    room.players.forEach(p => {
        const chip = document.createElement('div');
        chip.className = 'player-chip' + (p.id === room.hostId ? ' is-host' : '');
        chip.innerText = p.nickname + (p.id === myId ? ' (나)' : '');
        playerListDiv.appendChild(chip);
    });

    const startBtn = document.getElementById('start-btn');
    const hostNotice = document.getElementById('host-notice');
    if (room.hostId === myId) {
        startBtn.style.display = 'inline-block';
        hostNotice.innerText = '당신이 방장입니다. 인원이 모이면 시작을 누르세요.';
    } else {
        startBtn.style.display = 'none';
        hostNotice.innerText = '방장이 게임을 시작할 때까지 대기하세요.';
    }

    if (room.isStarted) {
        document.getElementById('waiting-room').style.display = 'none';
        document.getElementById('game-board').style.display = 'flex';

        const currentTurnPlayer = room.players[room.turn];
        const isMyTurn = currentTurnPlayer && currentTurnPlayer.id === myId;
        const turnBanner = document.getElementById('turn-banner');

        if (isMyTurn) {
            turnBanner.innerText = '🔥 [내 차례입니다!] 카드를 선택하세요';
            turnBanner.className = 'turn-banner turn-my-turn';
        } else {
            turnBanner.innerText = `⏳ [${currentTurnPlayer.nickname}] 님의 차례 진행 중...`;
            turnBanner.className = 'turn-banner turn-other-turn';
        }

        const oppArea = document.getElementById('opponents-area');
        oppArea.innerHTML = '';
        room.players.forEach((player, idx) => {
            if (player.id !== myId) {
                const box = document.createElement('div');
                const isThisPlayerTurn = (idx === room.turn);
                box.className = 'opponent-box' + (isThisPlayerTurn ? ' active-turn' : '');
                box.innerHTML = `<h4>${player.nickname} ${isThisPlayerTurn ? '⚡' : ''}</h4>`;
                
                const pigZone = document.createElement('div');
                pigZone.className = 'pig-zone';
                player.pigs.forEach((pig, pigIdx) => {
                    pigZone.appendChild(renderPigElement(pig, player.id, pigIdx));
                });
                box.appendChild(pigZone);
                oppArea.appendChild(box);
            }
        });

        const me = room.players.find(p => p.id === myId);
        if (me) {
            document.getElementById('my-name-display').innerText = `내 돼지 (${me.nickname})`;
            
            const myPigZone = document.getElementById('my-pigs');
            myPigZone.innerHTML = '';
            me.pigs.forEach((pig, pigIdx) => {
                myPigZone.appendChild(renderPigElement(pig, me.id, pigIdx));
            });

            const myHandZone = document.getElementById('my-hand');
            myHandZone.innerHTML = '';
            me.hand.forEach((cardName, idx) => {
                const cardElem = document.createElement('div');
                cardElem.className = 'card card-' + cardName + (selectedCardIdx === idx ? ' selected' : '');
                cardElem.onclick = () => selectCard(idx, cardName);
                myHandZone.appendChild(cardElem);
            });
        }

        const centerDisplay = document.getElementById('played-card-display');
        if (room.centerCard) {
            if (room.centerCard === 'discard_all') {
                centerDisplay.className = 'card card-back';
                centerDisplay.innerHTML = '<span>카드 버림</span>';
            } else {
                centerDisplay.className = 'card card-' + room.centerCard;
                centerDisplay.innerHTML = '';
            }
            centerDisplay.style.opacity = '1';
        } else {
            centerDisplay.style.opacity = '0';
        }
    }
});

socket.on('errorMsg', (msg) => { 
    alert(msg); 
    selectedCardIdx = null; 
    document.querySelectorAll('.pig-container').forEach(el => el.classList.remove('target-selectable'));
    document.querySelectorAll('#my-hand .card').forEach(c => c.classList.remove('selected'));
});

socket.on('gameOver', (msg) => { 
    alert(msg); 
    location.reload(); 
});
