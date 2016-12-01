const postcss = require( 'postcss' )

const { isKeyframeRule, isKeyframeAlreadyProcessed, isKeyframeSymmetric, rtlifyKeyframe } = require( './keyframes' )
const { getDirRule, processSrcRule } = require( './rules' )
const { rtlifyDecl, ltrifyDecl } = require( './decls' )

module.exports = postcss.plugin( 'postcss-rtl', () => css => {

    // selectors have direction related properties
    // should add [dir] prefix to increase priority
    const dirRegExp = [
        /direction/im,
        /left/im,
        /right/im,
        /^(margin|padding|border-(color|style|width))$/ig,
        /border-radius/ig,
        /shadow/ig,
        /transform-origin/ig,
        /^(?!text\-).*?transform$/ig,
        /transition(-property)?$/i,
        /background(-position(-x)?|-image)?$/i,
        /float|clear|text-align/i,
        /cursor/i
    ]

    let keyframes = []

    // collect @keyframes
    css.walkAtRules( rule => {
        if ( !isKeyframeRule( rule ) ) return
        if ( isKeyframeAlreadyProcessed( rule ) ) return
        if ( isKeyframeSymmetric( rule ) ) return

        keyframes.push( rule.params )
        rtlifyKeyframe( rule )
    } )

    // Simple rules (includes rules inside @media-queries)
    css.walkRules( rule => {
        let ltrDecls = []
        let rtlDecls = []
        let dirDecls = []

        if ( rule.selector.match( /\[dir/ ) ) return
        if ( isKeyframeRule( rule.parent ) ) return

        rule.walkDecls( decl => {
            const rtl = rtlifyDecl( decl, keyframes )

            if ( rtl ) {
                ltrDecls.push( ltrifyDecl( decl, keyframes ) )
                rtlDecls.push( decl.clone( rtl ) )
                return
            }

            if ( dirRegExp.some( re => !!decl.prop.match( re ) ) ) {
                dirDecls.push( decl )
                decl.remove()
            }
        } )

        if ( rtlDecls.length ) {
            let ltrDirRule
            getDirRule( rule, 'rtl' ).append( rtlDecls )
            ltrDirRule = getDirRule( rule, 'ltr' )
            ltrDecls.forEach( _decl => _decl.moveTo( ltrDirRule ) )
        }

        if ( dirDecls.length ) {
            getDirRule( rule, 'dir' ).append( dirDecls )
        }

        /* set dir attrs */
        processSrcRule( rule )
    } )
    return false
} )
