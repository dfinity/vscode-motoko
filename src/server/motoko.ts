import getMotoko from 'motoko/lib';

const mo = getMotoko(require('../generated/moc.js').Motoko as any);

export default mo;
