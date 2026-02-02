const express = require("express");
const { listKnowledgeSources } = require("../knowledge/retrieve");

const router = express.Router();

router.get("/knowledge/sources", (req, res, next) => {
  try {
    const sources = listKnowledgeSources();
    res.json({ sources });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
