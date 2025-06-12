import { insertCardStmt, deleteCardsByMapStmt, selectCardStmt, updateCardStmt, selectDueCardsStmt } from './db.js';

export function addFsrsForTree(mapId, userId, tree) {
  const today = new Date().toISOString().slice(0, 10);
  traverseTree(tree, [], (node, path) => {
    insertCardStmt.run(mapId, userId, JSON.stringify(path), 0.5, 5, today);
  });
}

export function rebuildFsrs(mapId, userId, tree) {
  deleteCardsByMapStmt.run(mapId, userId);
  addFsrsForTree(mapId, userId, tree);
}

export function schedule(card, rating) {
  let stability = card.stability || 0.5;
  let difficulty = card.difficulty || 5;
  if (rating < 3) {
    stability = 0.5;
    difficulty = Math.min(10, difficulty + 1);
  } else {
    stability = stability * 1.2 + rating * 0.1;
    difficulty = Math.max(1, difficulty - (rating - 3));
  }
  const days = Math.ceil(stability * 5);
  const due = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return { stability, difficulty, due };
}

export function traverseTree(node, path = [], cb) {
  cb(node, path);
  if (node.children) {
    node.children.forEach((c, i) => traverseTree(c, [...path, i], cb));
  }
}

export function getDueCards(userId, date) {
  return selectDueCardsStmt.all(userId, date).map(r => ({ mapId: r.mapId, path: JSON.parse(r.path), due: r.due }));
}

export function getCard(userId, mapId, path) {
  return selectCardStmt.get(userId, mapId, JSON.stringify(path));
}

export function updateCard(cardId, stability, difficulty, due) {
  updateCardStmt.run(stability, difficulty, due, cardId);
}
