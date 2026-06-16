function createTournament(tracks, size = 16) {
  size = (size === 32) ? 32 : 16;
  const numMatches = size / 2;
  const totalRounds = Math.log2(size);

  while (tracks.length < size) {
    const i = tracks.length;
    tracks.push({
      id: 'placeholder_' + i,
      title: 'Track ' + (i + 1),
      artist: 'TBD',
      thumbnail: '',
      duration: 180,
      streamUrl: '',
      youtubeId: 'placeholder_' + i
    });
  }

  const round0 = [];
  for (let i = 0; i < numMatches; i++) {
    round0.push({
      id: 'm0_' + i,
      trackA: { ...tracks[i * 2] },
      trackB: { ...tracks[i * 2 + 1] },
      votes: {},
      winnerId: null
    });
  }

  const rounds = [round0];
  for (let r = 1; r < totalRounds; r++) {
    const count = size / Math.pow(2, r + 1);
    const roundMatches = [];
    for (let i = 0; i < count; i++) {
      roundMatches.push({
        id: `m${r}_${i}`,
        trackA: null,
        trackB: null,
        votes: {},
        winnerId: null
      });
    }
    rounds.push(roundMatches);
  }

  return {
    size,
    rounds,
    currentRound: 0,
    currentMatchIndex: 0,
    status: 'pairing',
    champion: null
  };
}

function voteMatch(room, matchId, socketId, trackVoted) {
  const tour = room.tournament;
  if (!tour) return null;

  const round = tour.rounds[tour.currentRound];
  const match = round.find(m => m.id === matchId);
  if (!match || match.winnerId) return null;

  match.votes[socketId] = trackVoted;

  const votesA = Object.values(match.votes).filter(v => v === 'a').length;
  const votesB = Object.values(match.votes).filter(v => v === 'b').length;
  const userCount = Object.keys(room.users).length;
  const allVoted = Object.keys(match.votes).length >= userCount;

  if (allVoted) {
    match.winnerId = votesA >= votesB ? 'a' : 'b';
    return { match, winnerId: match.winnerId, allVoted: true, votesA, votesB };
  }

  return { match, allVoted: false, votesA, votesB };
}

function advanceRound(tournament) {
  const currentMatches = tournament.rounds[tournament.currentRound];
  const winners = currentMatches.map(m =>
    m.winnerId === 'a' ? m.trackA : m.trackB
  );

  const nextRoundIndex = tournament.currentRound + 1;

  if (nextRoundIndex >= tournament.rounds.length) {
    tournament.champion = winners[0];
    tournament.status = 'finished';
    return tournament;
  }

  const nextRound = tournament.rounds[nextRoundIndex];
  for (let i = 0; i < nextRound.length; i++) {
    nextRound[i].trackA = winners[i * 2];
    nextRound[i].trackB = winners[i * 2 + 1] || null;
    nextRound[i].votes = {};
    nextRound[i].winnerId = null;
  }

  tournament.currentRound = nextRoundIndex;
  tournament.currentMatchIndex = 0;

  return tournament;
}

function getTournamentState(tournament) {
  if (!tournament) return null;
  return {
    size: tournament.size,
    rounds: tournament.rounds.map(r => r.map(m => ({
      id: m.id,
      trackA: m.trackA ? { ...m.trackA } : null,
      trackB: m.trackB ? { ...m.trackB } : null,
      votes: { ...m.votes },
      winnerId: m.winnerId
    }))),
    currentRound: tournament.currentRound,
    currentMatchIndex: tournament.currentMatchIndex,
    status: tournament.status,
    champion: tournament.champion ? { ...tournament.champion } : null
  };
}

function getCurrentMatch(tournament) {
  const round = tournament.rounds[tournament.currentRound];
  if (!round || round.length <= tournament.currentMatchIndex) return null;
  return round[tournament.currentMatchIndex];
}

function isTournamentOver(tournament) {
  return tournament.status === 'finished';
}

module.exports = { createTournament, voteMatch, advanceRound, getTournamentState, getCurrentMatch, isTournamentOver };
