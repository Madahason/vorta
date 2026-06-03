const router = require('express').Router();
router.post('/', (req, res) => res.json({ message: 'render stub' }));
module.exports = router;
