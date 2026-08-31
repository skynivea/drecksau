const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // 1. path 모듈 추가

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 2. absolute path 사용으로 수정
app.use(express.static(path.join(__dirname, 'public')));

// public 폴더의 정적 파일(HTML, CSS, 이미지) 제공
app.use(express.static('public')); 

const rooms = {};

// 카드 덱 생성 함수
function createDeck() {
    const deck = [];
    for(let i=0; i<21; i++) deck.push('mud');
    for(let i=0; i<4; i++) deck.push('rain');
    for(let i=0; i<9; i++) deck.push('barn');
    for(let i=0; i<4; i++) deck.push('lightning');
    for(let i=0; i<4; i++) deck.push('lightning_rod');
    for(let i=0; i<8; i++) deck.push('mockery');
    for(let i=0; i<4; i++) deck.push('lock');
    return deck.sort(() => Math.random() - 0.5); 
}

io.on('connection', (socket) => {
    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);
        if (!rooms[roomCode]) {
            rooms[roomCode] = { players: [], deck: createDeck(), discard: [], turn: 0, centerCard: null };
        }
        
        const room = rooms[roomCode];
        if (room.players.length >= 4) {
            socket.emit('errorMsg', '방이 꽉 찼습니다.');
            return;
        }

        // 현재 들어온 사람을 포함한 플레이어 수로 돼지 개수 계산
        const currentPlayers = room.players.length + 1;
        const pigCount = currentPlayers === 2 ? 5 : currentPlayers === 3 ? 4 : 3;

        // 깨끗한 돼지 지급
        const initialPigs = [];
        for(let i=0; i<pigCount; i++) {
            initialPigs.push({ isDirty: false, hasBarn: false, hasLightningRod: false, hasLock: false });
        }

        // 핸드 카드 3장 뽑기
        const initialHand = [];
        for(let i=0; i<3; i++) {
            if(room.deck.length > 0) initialHand.push(room.deck.pop());
        }

        const newPlayer = { id: socket.id, hand: initialHand, pigs: initialPigs };
        room.players.push(newPlayer);
        
        io.to(roomCode).emit('updateState', room);
    });

    socket.on('playCard', ({ roomCode, cardIdx, targetInfo }) => {
        const room = rooms[roomCode];
        if (!room || room.players[room.turn].id !== socket.id) return;

        const player = room.players[room.turn];
        const playedCard = player.hand.splice(cardIdx, 1)[0];
        
        // 모두가 볼 수 있게 중앙에 카드 세팅
        room.centerCard = playedCard; 

        if (playedCard === 'rain') {
            // 광역 비 효과
            room.players.forEach(p => {
                p.pigs.forEach(pig => {
                    if (!pig.hasBarn) pig.isDirty = false;
                });
            });
        } 
        // 진흙, 벼락 등 다른 카드 효과는 향후 이곳에 추가
        
        if (room.deck.length > 0) {
            player.hand.push(room.deck.pop());
        }

        const isWin = player.pigs.length > 0 && player.pigs.every(pig => pig.isDirty);
        if (isWin) {
            io.to(roomCode).emit('gameOver', `${socket.id} 님이 승리했습니다!`);
        } else {
            room.turn = (room.turn + 1) % room.players.length;
            io.to(roomCode).emit('updateState', room);
        }
    });
});

// Render 동적 포트 할당 호환
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
