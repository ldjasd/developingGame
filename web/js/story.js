'use strict';
/* story.js · 剧情角色与事件库 —— 由单文件版 index.html 逐字拆分（拆分映射见 README.md），逻辑/数值/文案未改。 */
    var STORY_CHARS = {
      senior:   { name: '藤原梢', role: '前辈 · 退役拳手', img: 'assets/story/senior.webp', desc: '在街机厅把你「捡」回拳馆的人。眼毒，嘴硬，心软。' },
      manager:  { name: '栗原真纪', role: '经纪人', img: 'assets/story/manager.webp', desc: '替你谈赞助与赛程的人。务实，算盘打得精，心也细。' },
      rival:    { name: '沈墨凛', role: '宿敌 · 防守反击型', img: 'assets/story/rival.webp', desc: '黑长直的反击高手。你们在擂台上见过不止一次了。' },
      teammate: { name: '林小葵', role: '同期队友', img: 'assets/story/teammate.webp', desc: '和你差不多时间进馆的同期生。元气，输了也笑着说下次。' }
    };

    /* ---------- 事件库（触发条件见 settleNow / doRelax / addAffinity 的挂接） ---------- */
    var STORY_EVENTS = {
      ev_stage1: { char: 'senior', title: '主线 · 入行', pages: [
        { w: 'senior', t: '从今天起，这里就是你的拳馆了。规矩不多：训练别偷懒，挨打别哭鼻子，赢了别飘。' },
        { w: 'me', t: '是，梢姐！我会从第 50 名，一路打上去的。' },
        { w: 'senior', t: '哼，口气不小。先把第一场赢下来，再跟我谈「一路」。' } ],
        choices: [
          { text: '「请梢姐以后多揍我几顿，我认真的」', fx: { aff: { senior: 6 } }, result: '她愣了一下，随即笑出声：「有意思。这可是你说的。」' },
          { text: '先去把训练计划排满再说', fx: { mind: 5, aff: { senior: 3 } }, result: '她看着你走向沙袋，轻轻点了点头。' } ] },
      ev_stage2: { char: 'manager', title: '主线 · 经纪人登场', pages: [
        { w: 'manager', t: '正式自我介绍一下：栗原真纪。你的比赛录像我看过了——技术粗糙，但有股不服输的劲儿，我喜欢。' },
        { w: 'manager', t: '赞助、赛程、奖金谈判，这些琐事以后都交给我。你只需要做一件事：赢。' } ],
        choices: [
          { text: '「那就拜托你了，真纪姐」', fx: { aff: { manager: 8 } }, result: '她合上文件夹，笑意里多了点真心：「成交。」' },
          { text: '「先看看你的本事再说」', fx: { mind: 5, aff: { manager: 3 } }, result: '她挑了挑眉：「好啊，我就喜欢难谈的客户。」' } ] },
      ev_stage3: { char: 'teammate', title: '主线 · 国内新星', pages: [
        { w: 'teammate', t: '你看到报道了吗？「国内新星」！我妈都打电话问我，认不认识你！' },
        { w: 'me', t: '小葵，你比我还激动。' },
        { w: 'teammate', t: '那当然！我们是同期哎。……不过说好了，我可不会原地踏步等你。' } ],
        choices: [
          { text: '约她一起加练，谁先喊累谁请客', fx: { aff: { teammate: 8 }, mind: 5 }, result: '你们练到场馆熄灯，谁也没先喊累。' },
          { text: '请她去吃拉面庆祝', fx: { money: -100, aff: { teammate: 10 } }, result: '她吃了三碗，拍着肚子说这顿记你一辈子。' } ] },
      ev_stage4: { char: 'rival', title: '主线 · 前十的墙', pages: [
        { w: 'rival', t: '前十了？比我预想的要快一点。' },
        { w: 'rival', t: '不过你打进来的方式太吵了。真正的墙，在我这一侧。想过去，先过我。' } ],
        choices: [
          { text: '「那我就把你这堵墙打穿」', fx: { aff: { rival: 6 }, mind: 5 }, result: '她第一次在你面前露出笑意：「这才像话。」' },
          { text: '「你也是前十，少装前辈」', fx: { aff: { rival: 8 } }, result: '她转身走向训练区，只丢下一句：「擂台上见。」' } ] },
      ev_stage5: { char: 'senior', title: '主线 · 国内之巅', pages: [
        { w: 'senior', t: '国内第一了啊……我像你这么大的时候，连前二十的边都摸不到。' },
        { w: 'senior', t: '当年我没走完的路，你替我去看看也好。去吧，别回头。' } ],
        choices: [
          { text: '「梢姐，我会带着你的那一份一起赢」', fx: { aff: { senior: 10 } }, result: '她飞快地别过脸，假装去看窗外：「……油嘴。」' },
          { text: '「等我把世界腰带拿回来，给你摸」', fx: { aff: { senior: 8 }, mind: 5 }, result: '「一言为定。摸不到，你就等着挨揍吧。」' } ] },
      ev_stage6: { char: 'manager', title: '主线 · 传奇', pages: [
        { w: 'manager', t: '从街机厅的测力机，一路打到传奇。这份履历，够我吹十年了。' },
        { w: 'manager', t: '不过我知道，传奇对你来说不是终点对吧？我已经在帮你看下一场了。' } ],
        choices: [
          { text: '「老规矩，我只管赢」', fx: { aff: { manager: 10 } }, result: '她把新赛程递给你，像递过很多次那样自然。' },
          { text: '请她吃一顿好的，庆祝一下', fx: { money: -500, aff: { manager: 12 } }, result: '那天晚上，你们谁也没提工作。' } ] },
      ev_firstwin: { char: 'teammate', title: '节点 · 第一场胜利', pages: [
        { w: 'teammate', t: '赢了！！第一场就赢了！我就知道你可以的！' },
        { w: 'teammate', t: '刚才最后一回合，我在台下喊得嗓子都哑了。' } ],
        choices: [
          { text: '和她击掌庆祝', fx: { aff: { teammate: 8 }, mind: 5 }, result: '掌心拍在一起，两个人都笑了。' },
          { text: '「这才刚开始呢」', fx: { aff: { teammate: 5 } }, result: '「就是这个气势！下一场我还去喊！」' } ] },
      ev_firstloss: { char: 'senior', title: '节点 · 第一场败北', pages: [
        { w: 'senior', t: '输一场而已，脸拉这么长。' },
        { w: 'senior', t: '听好了：赢的比赛给你奖金，输的比赛给你真相。它会告诉你，你哪儿是假的。' } ],
        choices: [
          { text: '回去把这场录像看十遍', fx: { aff: { senior: 6 }, attr: 'technique', attrN: 1 }, result: '你把每一个失误都记在了本子上。技术 +1。' },
          { text: '先睡一觉，明天再说', fx: { stamina: 15, aff: { senior: 2 } }, result: '她没拦你：「也好，哭丧着脸练不出东西。」' } ] },
      ev_top25: { char: 'manager', title: '节点 · 打进前 25', pages: [
        { w: 'manager', t: '前 25 了。从今天起，你的名字会出现在每个对手的侦察名单第一页。' },
        { w: 'manager', t: '被人研究，是强者的待遇。习惯它。' } ],
        choices: [
          { text: '「让他们研究去吧」', fx: { mind: 5, aff: { manager: 5 } }, result: '她在本子上记了一笔：「心态，合格。」' },
          { text: '「那我得练得更难看透才行」', fx: { attr: 'technique', attrN: 1, aff: { manager: 4 } }, result: '技术 +1。真纪姐难得地夸了你一句上进。' } ] },
      ev_top10: { char: 'rival', title: '节点 · 打进前 10', pages: [
        { w: 'rival', t: '前十的空气，怎么样？' },
        { w: 'rival', t: '别急着高兴。守擂的人，下手都比爬擂台的人狠——包括我。' } ],
        choices: [
          { text: '「那我倒要试试有多狠」', fx: { aff: { rival: 6 }, mind: 5 }, result: '她抱起手臂，算是接受了挑战。' },
          { text: '「你是在提醒我，还是在担心我？」', fx: { aff: { rival: 8 } }, result: '她耳尖微微一红，转身就走：「……随你怎么想。」' } ] },
      ev_champ: { char: 'senior', title: '节点 · 登顶国内第一', pages: [
        { w: 'senior', t: '腰带……真让你拿到了。' },
        { w: 'senior', t: '我退役那天，在空场馆里坐了很久，想象过很多次这个画面。主角不是我……也没关系了。' } ],
        choices: [
          { text: '「梢姐，下一个目标是世界」', fx: { aff: { senior: 10 }, mind: 10 }, result: '她深吸一口气，用力拍了拍你的肩膀。' },
          { text: '拉她一起合影，让她站中间', fx: { aff: { senior: 12 } }, result: '照片里，她笑得有点不好意思。那张照片后来一直摆在拳馆前台。' } ] },
      ev_firstko: { char: 'teammate', title: '节点 · 第一次 KO 对手', pages: [
        { w: 'teammate', t: '刚才那一拳……全场都站起来了！你把对手直接打停了！' },
        { w: 'teammate', t: '我鸡皮疙瘩都起来了。这就是 KO 的感觉吗？' } ],
        choices: [
          { text: '「我自己也没想到这么干净利落」', fx: { aff: { teammate: 6 } }, result: '她围着你转了两圈，像在看什么珍稀动物。' },
          { text: '先去确认对手没事', fx: { aff: { teammate: 8 }, mind: 5 }, result: '对手并无大碍。小葵小声说：「你这人，还挺温柔的。」' } ] },
      ev_firstkoed: { char: 'senior', title: '节点 · 第一次被 KO', pages: [
        { w: 'senior', t: '醒了？被 KO 就是这种感觉：天旋地转，耳朵里像塞了棉花。' },
        { w: 'senior', t: '把这个感觉记住。下次，让对手去记。' } ],
        choices: [
          { text: '「记住了。下次换我」', fx: { mind: 10, aff: { senior: 5 } }, result: '她把冰袋递给你：「眼神不错，没被打散。」' },
          { text: '「头还晕……但我不怕」', fx: { aff: { senior: 8 } }, result: '「不怕就好。怕了，这行就到头了。」' } ] },
      ev_rival_win: { char: 'rival', title: '宿敌 · 赛后', repeat: true, pages: [
        { w: 'rival', t: '……是我输了。别得意，你的直拳只比上次快了一点点而已。' },
        { w: 'rival', t: '下一次，我会把那一点点也封掉。' } ],
        choices: [
          { text: '「随时奉陪」', fx: {}, result: '她擦了擦汗，转身走回自己的训练区，步子比平时快。' },
          { text: '「其实你的反击也吓到我了」', fx: {}, result: '她脚步一顿，没有回头：「……哼，算你有眼光。」' } ] },
      ev_rival_lose: { char: 'rival', title: '宿敌 · 赛后', repeat: true, pages: [
        { w: 'rival', t: '就这？我还以为你藏着什么新东西。' },
        { w: 'rival', t: '回去练。输给我不丢人，输给自己的慌乱，才丢人。' } ],
        choices: [
          { text: '「下次不会了」', fx: {}, result: '「但愿如此。」她丢给你一瓶水——大概是她的方式。' },
          { text: '沉默地接过她的水', fx: {}, result: '你们谁也没再说话，但气氛并不坏。' } ] },
      aff_senior_30: { char: 'senior', title: '藤原梢 · 旧手套', pages: [
        { w: 'senior', t: '拿着。我退役前用的手套，皮子都磨亮了。借你戴一周——只借一周啊。' },
        { w: 'me', t: '梢姐，这可是你的宝贝……' },
        { w: 'senior', t: '宝贝才要给对的人。戴坏了，拿你的冠军奖金赔我。' } ],
        choices: [
          { text: '郑重地双手接过来', fx: { aff: { senior: 6 } }, result: '那一周的训练，你格外认真。' },
          { text: '开玩笑：「不会有怪味吧？」', fx: { aff: { senior: 4 }, mind: 5 }, result: '后脑勺挨了轻轻一巴掌。你们都笑了。' } ] },
      aff_senior_60: { char: 'senior', title: '藤原梢 · 没说完的那场', pages: [
        { w: 'senior', t: '我退役那场，第七回合，肩伤复发。裁判问我还能不能打，我说能——然后就什么都不知道了。' },
        { w: 'senior', t: '醒来躺在医院里，第一反应是：啊，我的职业生涯，原来就这么长。' } ],
        choices: [
          { text: '安静地听她说完', fx: { aff: { senior: 8 } }, result: '她讲了很久。这些话，她没跟别人说过。' },
          { text: '「你的那一份，我替你打回来」', fx: { aff: { senior: 10 }, mind: 5 }, result: '她沉默了几秒，轻声说：「那我可当真了。」' } ] },
      aff_senior_90: { char: 'senior', title: '藤原梢 · 看台第一排', pages: [
        { w: 'senior', t: '决赛那天，我在看台第一排。票我早就买好了。' },
        { w: 'senior', t: '我这辈子没站上的地方……你站上去的时候，我要在最近的地方看着。就这么说定了。' } ],
        choices: [
          { text: '「那我可输不起了」', fx: { aff: { senior: 6 }, mind: 10 }, result: '她伸出手，和你拉了个钩。指尖有点凉，又很稳。' },
          { text: '「梢姐，谢谢你当初叫住我」', fx: { aff: { senior: 8 } }, result: '她别开脸，耳根有点红：「……我等你。」' } ] },
      aff_manager_30: { char: 'manager', title: '栗原真纪 · 深夜账本', pages: [
        { w: 'narr', t: '深夜的办公室，只剩一盏灯。真纪姐还在对账，咖啡早就凉透了。' },
        { w: 'manager', t: '嗯？你怎么还没走。……别看我这样，我可是很能干的。' } ],
        choices: [
          { text: '坐下来帮她一起重算', fx: { aff: { manager: 6 } }, result: '两个人对到半夜，效率意外地高。' },
          { text: '给她换一杯热的', fx: { aff: { manager: 8 }, mind: 3 }, result: '她捧着杯子愣了愣：「……谢谢。难得有人注意到这个。」' } ] },
      aff_manager_60: { char: 'manager', title: '栗原真纪 · 不接的电话', pages: [
        { w: 'manager', t: '前几天有家大俱乐部想挖我，开价是现在的两倍。我拒了。' },
        { w: 'manager', t: '我签的人还没拿冠军呢。我哪儿也不去——这话可别传出去，掉价。' } ],
        choices: [
          { text: '「那我更得快点拿冠军了」', fx: { aff: { manager: 10 } }, result: '她笑起来：「这才是我签的人。」' },
          { text: '「真纪姐，你对我真好」', fx: { aff: { manager: 8 } }, result: '她推了推眼镜，掩饰般地翻起文件：「我是职业的。」' } ] },
      aff_manager_90: { char: 'manager', title: '栗原真纪 · 庆功宴的角落', pages: [
        { w: 'manager', t: '奖金、合同、下一场……都明天再说。今晚，只庆祝你。' },
        { w: 'manager', t: '敬你。从测力机前的小姑娘，到今天。这一杯，我盼了很久了。' } ],
        choices: [
          { text: '和她碰杯，什么也不说', fx: { aff: { manager: 8 }, mind: 10 }, result: '有些话，不说出来反而更清楚。' },
          { text: '「真纪姐，你今天有点不一样」', fx: { aff: { manager: 10 } }, result: '她耳根微红，举起杯子挡住脸：「……喝你的。」' } ] },
      aff_rival_30: { char: 'rival', title: '沈墨凛 · 录像室门口', pages: [
        { w: 'narr', t: '深夜的录像室门口，你和沈墨凛撞了个正着。屏幕上暂停着的，正是你的比赛。' },
        { w: 'rival', t: '……研究对手，天经地义。你少自作多情。' } ],
        choices: [
          { text: '「研究我？荣幸之至」', fx: { aff: { rival: 6 } }, result: '她抱着手臂让开半步，没有否认。' },
          { text: '坐下来和她一起看完，顺便指出她的破绽', fx: { aff: { rival: 8 }, attr: 'technique', attrN: 1 }, result: '你们互相挑了一晚上的错。技术 +1——这种进步方式，还挺特别的。' } ] },
      aff_rival_60: { char: 'rival', title: '沈墨凛 · 雨天的伞', pages: [
        { w: 'narr', t: '比赛场馆外突然下起大雨。你正犹豫要不要冲出去，一把伞从旁边伸了过来。' },
        { w: 'rival', t: '顺路。别多想。……走吧，你感冒了，下场比赛就不好看了。' } ],
        choices: [
          { text: '老老实实走进伞下', fx: { aff: { rival: 8 } }, result: '一路无话，但伞一直稳稳地偏向你这边。' },
          { text: '「你的肩膀都湿了」', fx: { aff: { rival: 10 } }, result: '她像是被烫到一样顿了一下：「……看路。」' } ] },
      aff_rival_90: { char: 'rival', title: '沈墨凛 · 终点的约定', pages: [
        { w: 'narr', t: '决赛前夜，你收到一条没有署名的短信，只有一句：「别输给别人。我在终点等你。」' },
        { w: 'rival', t: '（你知道是谁。除了她，不会有第二个人这样说话。）' } ],
        choices: [
          { text: '回复：「洗干净脖子等着」', fx: { aff: { rival: 8 }, mind: 5 }, result: '对面秒回了一个「哼」。你看着屏幕，笑了起来。' },
          { text: '回复：「终点见」', fx: { aff: { rival: 10 }, mind: 10 }, result: '这次，对面过了很久才回：「嗯。」只有一个字，却像一句约定。' } ] },
      aff_teammate_30: { char: 'teammate', title: '林小葵 · 手缝的护腕', pages: [
        { w: 'teammate', t: '给你的！我自己缝的护腕。……针脚是有点歪啦，但结实！特别结实！' },
        { w: 'teammate', t: '你比赛的时候戴着它，就当我在台下给你加油了。' } ],
        choices: [
          { text: '当场戴上，活动了两下手腕', fx: { aff: { teammate: 8 } }, result: '她眼睛一下子亮了：「好看吧！我就说好看！」' },
          { text: '「丑是丑了点，但我喜欢」', fx: { aff: { teammate: 10 } }, result: '她先瞪你，随后笑得直不起腰。' } ] },
      aff_teammate_60: { char: 'teammate', title: '林小葵 · 陪练到天黑', pages: [
        { w: 'teammate', t: '再来一组！说好陪你练完的——哎哟，我先躺会儿……' },
        { w: 'narr', t: '场馆熄灯前，你们并排瘫在垫子上，谁也不想先起来。' } ],
        choices: [
          { text: '「今天谢谢你，小葵」', fx: { aff: { teammate: 8 }, mind: 5 }, result: '「同期嘛。」她望着天花板，笑得很满足。' },
          { text: '「下次你加练，我陪你」', fx: { aff: { teammate: 10 } }, result: '「拉钩！谁赖账谁是小狗！」' } ] },
      aff_teammate_90: { char: 'teammate', title: '林小葵 · 先说好的事', pages: [
        { w: 'teammate', t: '那个……我提前跟你说好。如果有一天，我们在正式比赛里碰上——' },
        { w: 'teammate', t: '谁也不许让谁。放水，是对对手最大的不尊重。答应我？' } ],
        choices: [
          { text: '「一言为定，全力以赴」', fx: { aff: { teammate: 10 } }, result: '她重重点头，眼眶却有点发红，又飞快地笑起来。' },
          { text: '「好。输的人请吃拉面」', fx: { aff: { teammate: 8 } }, result: '「那你可要破产了！」她笑得眼睛弯成月牙。' } ] },
      daily_1: { char: 'teammate', title: '日常 · 河边的偶遇', pages: [
        { w: 'teammate', t: '咦——！你也来河边跑步？好巧！我刚跑完五公里，腿都软了。' } ],
        choices: [
          { text: '陪她慢慢走一段', fx: { aff: { teammate: 5 }, mind: 3 }, result: '沿着河边走了一会儿，风很舒服。' },
          { text: '和她竞速跑完最后一程', fx: { aff: { teammate: 4 }, attr: 'footwork', attrN: 1 }, result: '她咬牙跟上了你。步伐速度 +1。' } ] },
      daily_2: { char: 'manager', title: '日常 · 便利店', pages: [
        { w: 'manager', t: '……别看我。谈判了一整天，晚饭就只能这样了。饭团，很营养的。' } ],
        choices: [
          { text: '帮她拿最高层那罐热饮', fx: { aff: { manager: 6 } }, result: '她接过热饮，小声说了句谢谢。' },
          { text: '吐槽她的晚饭太随便', fx: { aff: { manager: 4 }, mind: 5 }, result: '「职业经理人也是人啊。」她无奈地笑了。' } ] },
      daily_3: { char: 'senior', title: '日常 · 公园的清晨', pages: [
        { w: 'narr', t: '清晨的公园里，梢姐正一个人慢慢打着空击——慢得像太极，每一拳却都稳得可怕。' },
        { w: 'senior', t: '来了？别愣着。慢，才看得清自己。' } ],
        choices: [
          { text: '跟着她慢慢打完一套', fx: { aff: { senior: 5 }, attr: 'defense', attrN: 1 }, result: '慢练出真章。防守技术 +1。' },
          { text: '在旁边安静地看完', fx: { aff: { senior: 4 } }, result: '她收势时点了点头，像是认可了你的耐心。' } ] }
    };
