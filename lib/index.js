"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

const postcss = require('postcss');

const affectedProps = require('./affected-props');

const _require = require('./options'),
      validateOptions = _require.validateOptions;

const _require2 = require('./keyframes'),
      isKeyframeRule = _require2.isKeyframeRule,
      isKeyframeAlreadyProcessed = _require2.isKeyframeAlreadyProcessed,
      isKeyframeSymmetric = _require2.isKeyframeSymmetric,
      rtlifyKeyframe = _require2.rtlifyKeyframe;

const _require3 = require('./rules'),
      getDirRule = _require3.getDirRule,
      processSrcRule = _require3.processSrcRule;

const _require4 = require('./decls'),
      rtlifyDecl = _require4.rtlifyDecl,
      ltrifyDecl = _require4.ltrifyDecl;

const _require5 = require('./selectors'),
      isSelectorHasDir = _require5.isSelectorHasDir;

module.exports = postcss.plugin('postcss-rtl', options => css => {
  const keyframes = [];
  options = validateOptions(options);

  const handleIgnores = (removeComments = false) => {
    let isIgnored = false;
    let continuousIgnore = false;
    return node => {
      if (node.type === 'comment') {
        const text = node.text;

        switch (true) {
          case /^(!\s)?rtl:ignore$/.test(text):
            isIgnored = true;
            continuousIgnore = continuousIgnore || false;
            if (removeComments) node.remove();
            break;

          case /^(!\s)?rtl:begin:ignore$/.test(text):
            isIgnored = true;
            continuousIgnore = true;
            if (removeComments) node.remove();
            break;

          case /^(!\s)?rtl:end:ignore$/.test(text):
            isIgnored = false;
            continuousIgnore = false;
            if (removeComments) node.remove();
            break;

          default:
        }

        return true;
      }

      if (!continuousIgnore && isIgnored) {
        isIgnored = false;
        return true;
      }

      return isIgnored;
    };
  };

  const isKeyframeIgnored = handleIgnores();
  const isRuleIgnored = handleIgnores(options.removeComments); // collect @keyframes

  css.walk(rule => {
    if (isKeyframeIgnored(rule)) return;
    if (rule.type !== 'atrule') return;
    if (!isKeyframeRule(rule)) return;
    if (isKeyframeAlreadyProcessed(rule)) return;
    if (isKeyframeSymmetric(rule)) return;
    keyframes.push(rule.params);
    rtlifyKeyframe(rule, options);
  });
  const valueIgnoreDirective = /\/\*!? *rtl *: *ignore *\*\/$/;
  const valuePrependDirective = /\/\*!? *rtl *: *prepend *: *([\S| ]*?) *\*\/$/;
  const valueAppendDirective = /\/\*!? *rtl *: *append *: *([\S| ]*?) *\*\/$/;
  const valueReplacementDirective = /\/\*!? *rtl *: *([\S| ]*?) *\*\/$/;

  const handleValueDirectives = (decl, ltrDecls, rtlDecls) => {
    const _ref = decl.raws.value || {},
          raw = _ref.raw; // Is there NO raw value?


    if (!raw) return false; // Does the raw value contain an ignore directive?

    if (raw.match(valueIgnoreDirective)) return true; // Extract directive values using RegExp.

    const values = [valuePrependDirective, valueAppendDirective, valueReplacementDirective].map(regEx => (raw.match(regEx) || {})[1]);

    const _values = _slicedToArray(values, 3),
          prependValue = _values[0],
          appendValue = _values[1],
          replaceValue = _values[2];

    const addDecls = value => {
      // Create LTR declaration.
      ltrDecls.push(ltrifyDecl(decl, keyframes)); // Create RTL declaration with replacement value and add.

      const rtlClonedDecl = decl.clone({
        value
      });
      rtlClonedDecl.raws.value = {
        value,
        raw: value
      };
      rtlDecls.push(rtlClonedDecl);
      return true;
    }; // Does the raw value contain a prepend directive?


    if (prependValue) {
      return addDecls([prependValue, decl.value].join(' '));
    } // Does the raw value contain an append directive?


    if (appendValue) {
      return addDecls([decl.value, appendValue].join(' '));
    } // Does the raw value contain a replace directive?


    if (replaceValue) {
      return addDecls(replaceValue);
    }

    return false;
  }; // Simple rules (includes rules inside @media-queries)


  css.walk(node => {
    const ltrDecls = [];
    const rtlDecls = [];
    const dirDecls = [];
    if (isRuleIgnored(node)) return;

    if (node.type !== 'rule') {
      return;
    }

    const rule = node;
    if (isSelectorHasDir(rule.selector, options)) return;
    if (isKeyframeRule(rule.parent)) return;
    rule.walkDecls(decl => {
      // Is there a value directive?
      if (handleValueDirectives(decl, ltrDecls, rtlDecls)) return;
      const rtl = rtlifyDecl(decl, keyframes);

      if (rtl) {
        ltrDecls.push(ltrifyDecl(decl, keyframes));
        rtlDecls.push(decl.clone(rtl));
        return;
      }

      if (affectedProps.indexOf(decl.prop) >= 0) {
        dirDecls.push(decl);
        decl.remove();
      }
    });

    if (rtlDecls.length) {
      if (!options.onlyDirection || options.onlyDirection === 'rtl') {
        getDirRule(rule, 'rtl', options).append(rtlDecls);
      }

      const ltrDirRule = getDirRule(rule, 'ltr', options);
      ltrDecls.forEach(_decl => {
        _decl.cleanRaws(_decl.root() === ltrDirRule.root());

        try {
          rule.removeChild(_decl);
        } catch (e) {
          console.log(rule, _decl);
        }

        if (!options.onlyDirection || options.onlyDirection === 'ltr') {
          ltrDirRule.append(_decl);
        }
      });

      if (options.onlyDirection && options.onlyDirection === 'rtl') {
        ltrDirRule.remove();
      }
    }

    if (dirDecls.length) {
      getDirRule(rule, 'dir', options).append(dirDecls);
    }
    /* set dir attrs */


    processSrcRule(rule, options);
  });
  return false;
});