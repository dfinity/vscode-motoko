import getMotoko from 'motoko/lib';

const mo = getMotoko(require('../generated/moc_js.bc.js').Motoko as any);

export default mo;
