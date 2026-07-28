// package.json declares "type": "module", so this file is loaded as an ES
// module. It must use `export default`: with `module.exports` the config cannot
// be loaded at all and the commit-msg hook rejects every message, valid or not.
export default {
  extends: ['@commitlint/config-conventional'],
  // semantic-release writes its own `chore(release): x.y.z [skip ci]` commit with the generated
  // changelog as the body, and those lines carry full compare URLs that run well past
  // body-max-line-length. Once the commit-msg hook was made executable it started running for real,
  // and it rejected that commit, which failed the release job itself. Exempting only the release
  // commit keeps the 100 character limit meaningful for commits a human writes, which is the point
  // of the rule, without the tooling tripping over its own output.
  ignores: [message => /^chore\(release\): /.test(message)],
};
