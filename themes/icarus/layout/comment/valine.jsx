const { Component, Fragment } = require('inferno');

module.exports = class extends Component {
    
    render() {
        const { comment } = this.props;
        const js = `new Valine({
            el: '#vcomments' ,
            appId: '${comment.appId}',
            appKey: '${comment.appKey}',
        });`;
        return <Fragment>
            <div id="vcomments"></div>
            <script src='//unpkg.com/valine/dist/Valine.min.js'></script>
            <script dangerouslySetInnerHTML={{ __html: js }}></script>
        </Fragment>;
    }
};
