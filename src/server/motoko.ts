import getMotoko from 'motoko/lib';

// Load custom `moc.js` with Viper integration
const mo = getMotoko(require('../generated/moc.js').Motoko as any);

export default mo;
