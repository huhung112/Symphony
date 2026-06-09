const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------
// 🔹 데이터베이스 및 영상 저장소 경로 설정
// ----------------------------------------------------
// Render 환경이면 영구 디스크(/var/data)를, 로컬이면 현재 폴더(__dirname)를 사용합니다.
const BASE_DIR = process.env.RENDER ? '/var/data' : __dirname;

const dbFilePath = path.join(BASE_DIR, 'database.json');
const videoDir = path.join(BASE_DIR, 'videos');

// 유니티 클라이언트가 /videos/파일명.mp4 주소로 영상에 접근할 수 있도록 길을 열어줍니다.
app.use('/videos', express.static(videoDir));

// 서버가 켜질 때 DB 파일이 없으면 빈 배열로 하나 만들어줌
if (!fs.existsSync(dbFilePath)) {
    fs.writeFileSync(dbFilePath, JSON.stringify([]));
}

// 미들웨어 설정
app.use(express.json());
app.use(cors());

// 정적 파일(웹페이지 HTML)을 제공할 폴더 설정
app.use(express.static('public'));

// ----------------------------------------------------
// 🔹 데이터베이스 및 임시 데이터 설정
// ----------------------------------------------------
// 기존 기록용 데이터베이스 파일 경로 설정 (이 파일에 영구 저장됨)
const dbFilePath = path.join(__dirname, 'database.json');

// 서버가 켜질 때 DB 파일이 없으면 빈 배열로 하나 만들어줌
if (!fs.existsSync(dbFilePath)) {
    fs.writeFileSync(dbFilePath, JSON.stringify([]));
}

// 닉네임 중복 검사용 가상의 데이터베이스 (이미 누군가 사용 중인 닉네임들)
const mockDatabase = ["버추얼 길", "장연우", "홈런왕", "에이스"];

// ----------------------------------------------------
// 🔹 영상 저장을 위한 multer 세팅
// ----------------------------------------------------
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = videoDir; // ⭕ 수정 후 (위에서 만든 변수 사용)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    
    filename: function (req, file, cb) {
        // 영상 파일 이름이 겹치지 않도록 현재 시간(Date.now)을 파일명으로 사용
        cb(null, 'cheer_' + Date.now() + '.mp4'); 
    }
});

const upload = multer({ storage: storage });

// ----------------------------------------------------
// 🔹 API 라우터 모음
// ----------------------------------------------------

// 1. [유니티 -> 서버] 닉네임 중복 확인 API (새로 추가됨)
app.get('/api/check-nickname', (req, res) => {
    const nickname = req.query.nickname;

    if (!nickname) {
        return res.status(400).json({ error: '닉네임이 전달되지 않았습니다.' });
    }

    // 1. 데이터베이스(database.json) 읽어오기
    const rawData = fs.readFileSync(dbFilePath);
    const db = JSON.parse(rawData);

    // 2. DB에서 닉네임(squadName) 검색 
    // (replace로 모든 띄어쓰기를 없애고, toLowerCase()로 대소문자 구분을 없애서 완벽하게 차단합니다)
    const searchTarget = nickname.replace(/\s+/g, '').toLowerCase();

    const isDuplicate = db.some((match) => {
        if (!match.squadName) return false;
        const existName = match.squadName.replace(/\s+/g, '').toLowerCase();
        return existName === searchTarget;
    });

    // 3. 검사 결과를 반환
    res.json({ isDuplicate: isDuplicate });
});

// 2. [파이썬 -> 서버] 영상 업로드 API
app.post('/api/upload_video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).send("영상 파일이 없습니다.");
    }
    
    // 파이썬에서 같이 보내준 일련번호를 꺼냅니다.
    const matchId = req.body.matchId; 
    
    // 원래 저장된 임시 파일명 경로와 일련번호로 바꿀 새 경로
    const oldPath = req.file.path; 
    const newPath = path.join(videoDir, `${matchId}.mp4`);
    
    // 파일 이름 변경
    fs.renameSync(oldPath, newPath);

    console.log(`[서버] 🎥 인생네컷 영상 저장 완료! 일련번호: ${matchId}`);
    
    res.status(200).json({ 
        message: "영상 업로드 성공", 
        videoUrl: `/videos/${matchId}.mp4` 
    });
});

// 3. [유니티 -> 서버] 게임 결과 기록 API 
app.post('/api/save_match', (req, res) => {
    const matchData = req.body;
    matchData.timestamp = new Date().toLocaleString(); 

    const rawData = fs.readFileSync(dbFilePath);
    const db = JSON.parse(rawData);

    db.push(matchData);
    fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));

    console.log(`[서버] ${matchData.squadName} 응원단의 기록이 저장되었습니다!`);
    res.status(200).json({ message: "성공적으로 저장되었습니다." });
});

// 4. [웹사이트 -> 서버] 저장된 데이터 가져오기 API
app.get('/api/get_matches', (req, res) => {
    const rawData = fs.readFileSync(dbFilePath);
    res.json(JSON.parse(rawData));
});

// 5. [유니티/웹 -> 서버] 랭킹 데이터 가져오기 API
app.get('/api/get_ranking', (req, res) => {
    const rawData = fs.readFileSync(dbFilePath);
    let db = JSON.parse(rawData);

    db.sort((a, b) => b.totalScore - a.totalScore);

    res.json(db);
});

// 5-1. [유니티/웹 -> 서버] 개인 랭킹 (get_ranking과 동일, 클라 엔드포인트명 호환용)
app.get('/api/get_individual_ranking', (req, res) => {
    const rawData = fs.readFileSync(dbFilePath);
    let db = JSON.parse(rawData);
    db.sort((a, b) => b.totalScore - a.totalScore);
    res.json(db);
});

// 5-2. [유니티/웹 -> 서버] 팀 랭킹 (팀별 총점 합산 후 정렬)
app.get('/api/get_team_ranking', (req, res) => {
    const rawData = fs.readFileSync(dbFilePath);
    const db = JSON.parse(rawData);

    // 팀 이름을 Penguins/Bees/Wolves로 정규화(부분일치). 그 외는 '기타'로.
    const normalizeTeam = (team) => {
        if (!team) return '기타';
        if (team.includes('Penguins')) return 'Symphony Penguins';
        if (team.includes('Bees'))     return 'Angry Bees';
        if (team.includes('Wolves'))   return 'Silent Wolves';
        return '기타';
    };

    // 팀별 점수 합산
    const teamTotals = {};
    db.forEach((match) => {
        const teamKey = normalizeTeam(match.team);
        if (teamKey === '기타') return; // 정식 3팀만 집계
        const score = match.totalScore || 0;
        teamTotals[teamKey] = (teamTotals[teamKey] || 0) + score;
    });

    // 클라가 쓰는 형식(squadName/team/totalScore)에 맞춰 변환
    // squadName 칸에는 팀 이름을 넣어 그대로 표시되게 함
    const teamRanking = Object.keys(teamTotals).map((teamKey) => ({
        squadName: teamKey,        // 행에 팀 이름이 닉네임 자리로 표시됨
        team: teamKey,             // 로고 판별용
        totalScore: teamTotals[teamKey]
    }));

    teamRanking.sort((a, b) => b.totalScore - a.totalScore);

    res.json(teamRanking);
});

// 서버 실행
app.listen(PORT, () => {
    console.log(`🚀 서버 구동 완료! http://localhost:${PORT} 로 접속해보세요.`);
});