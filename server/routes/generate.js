const router = require('express').Router();
router.post('/', (req, res) => res.json({ message: 'generate stub' }));
module.exports = router;
