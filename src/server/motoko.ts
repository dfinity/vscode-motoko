import getMotoko from 'motoko/lib';

process.env.MOC_UNLOCK_VERIFICATION = "1";

const mo = getMotoko(require('../generated/moc.js').Motoko as any);

export default mo;