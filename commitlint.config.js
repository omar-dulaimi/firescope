// package.json declares "type": "module", so this file is loaded as an ES
// module. It must use `export default`: with `module.exports` the config cannot
// be loaded at all and the commit-msg hook rejects every message, valid or not.
export default {
  extends: ['@commitlint/config-conventional'],
};
