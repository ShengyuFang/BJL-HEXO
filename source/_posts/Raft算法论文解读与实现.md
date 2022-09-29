---
title: Raft算法论文解读与实现
date: 2022-09-30 21:01:00
categories: 分布式
---
## 相关资料 ## 
* 论文原文 https://ramcloud.atlassian.net/wiki/download/attachments/6586375/raft.pdf
* Raft演示动画 https://raft.github.io/#implementations 在实现raft协议时可以参考该网站JS代码，在resources中的raft.js  
  另个演示动画 http://thesecretlivesofdata.com/raft/
* MIT6.824课程实验 https://pdos.csail.mit.edu/6.824/labs/lab-raft.html

### Raft基本介绍
1. *Raft是为了解决什么问题* 
分布式系统的一致性,分布式集群中不同节点对同一请求返回结果需要保持一致。但是，Raft一致性的前提是系统中不会有伪造的消息，因此并不能解决拜占庭将军问题。

2. *Raft算法思路简介* 
为了避免系统不同节点返回不同结果造成的困惑，Raft采用少数服从多数的思路，大多数(超过集群节点数一半)的节点所认为的请求响应就被当作正确的响应。偶数节点会出现一半认为A一半认为B的情况，从而导致不一致，所以Raft节点总数必须是奇数。虽然Raft是分布式算法，但是Raft采用了集中式管理的思路，集群中存在唯一LEADER节点，只有LEADER节点可以将用户请求广播给各个节点。

### Raft初探
>首先明确一点，一个节点发送的请求可能在网络中被延迟很久才到达目标节点，用锁之类的解决不了这种问题，什么叫线程安全得重新思考下。但是Raft算法必须要解决这一的问题才能正确运行，于是Raft采用了Term的概念，是不是很像自增的分布式主键的思想？

>Raft将整个算法分为两个过程：leader选举和日志(包含了用户的命令)同步。节点有三种角色，follower candidate leader。

Raft中的role状态机
![状态机](/img/stateMachine.PNG)

1. Leader选举阶段
系统刚启动时所有节点都是follower，每个节点都会有个计时器，在计时器到达选举时间就转化为candidate并且让Term+1发起投票，而获得超过一半节点支持的candidate就会变成leader。
多个candidate参加选举可能引起选举失败，没有节点获得超过一半的选举票这时候进入下一轮选举，Term+1。为了避免多个节点同时成为candidate发起投票，每个几点计时器都会附加随机性。
2. 日志复制
选出LEADRE节点后，LEADER节点定时发送心跳包将日志广播给其他节点。其他节点收到LEADRE心跳后重置选举时间，如果是candidate则还会重新转化为follower节点。Raft是将日志同步请求放在心跳包中进行的。

上面只是粗略介绍了Raft算法的两个过程。试想一下可能存在的问题：
1. 怎么保证LEADER选举安全性，假设有个节点掉线很久，并且重连上后转换成了candidate发起了投票或者一个candidate的选举请求很晚才到达其他节点，这时候其他节点能给该节点投票么？如果不加限制条件的就答应投票可能会造成leader转为follower，然后不得不重新进行一轮选举，非常浪费资源。因此，这里引入raft文中第一条限制：只有candidate投票请求中的Term比收到请求的节点的term大或者相等才会把票投给它。
另外为了保证一轮选举只会有一个leader产生，所以已经投过票的节点不能再投票给其他节点(默认会投自己一票，这个例外)。
LEADER选举的安全性还与日志有关，这个下文章后面再讲。
2. 日志复制给其它节点的安全性。LEADRE节点A可能掉线重连，然后A会误以为自己仍是leader(在没收到新leader的心跳包情况下)继续将同步日志发送给其它节点。或者出现这种情况，LEADER节点A发送的同步日志很晚才到其它节点，此时已经选举出新的LEADER节点B。已经选举出新leader说明至少有一半节点收到后来的candidate的投票请求，然后将TERM+1。这种情况依然是比较TERM大小，对于TERM比自己小的请求节点不会处理。而如果还有节点TERM还未+1就收到A的请求，那么它会复制A的请求，但是下一次leaderB发送心跳包时会根据日志匹配的原则将那个节点上的该日志删除掉。

总结上面的问题：什么情况下节点会同意投票请求，follower节点收到日志同步请求怎样更新自己的日志。

从上面的讨论引出raft几个关键变量：nextIndex[] matchIndex[] preIndex commitIndex。Raft原文中的applied index可以先不用理，论文中基本没说那个干嘛用的！
### nextIndex[] matchIndex[]
1. 只有leader节点需要维护这两个变量
2. 日志同步过程
> 当一个节点刚成为leader节点，它不知道其他节点上的日志哪些是正确的(也就是和leader的日志是一致的)，哪些是错误的，它需要覆盖其他节点的错误日志。这里有个一直成立的条件，如果follower节点index i的日志与leader节点是一致的，那么它index i以前的日志也都会一致。这是由算法保证的。假设对某follower节点从index i开始尝试复制日志，leader节点发现自己index i的日志与follower日志不一致，那么尝试index i-1，依次类推，直到找到匹配的index。也可以采用2分法，但是有没有这个必要呢,不清楚。不清楚干脆不费劲。
3. 为什么需要这两个变量
> 一个节点成为leader节点后按照2.中的办法找到匹配的index，然后对每个其他节点开启一个同步线程，将后续的日志同步给follower节点，之后来了一个用户请求后立马将其同步给其他节点就行了。这样想，似乎没有必要维护这三个变量？但是这样做有一些无法解决的问题，leader同步请求的过程中来了其他请求怎么办？可能的解决办法是加一个matchIndex[]，记录follower节点日志匹配的下标，然后**不停地**从matchIndex到当前**日志末尾**同步。
那nextIndex[]干嘛用的呢？前面的"不停地"同步有问题，leader节点不停地同步太占用其他线程资源，所以raft都是通过心跳包里进行同步。每次同步时leader节点和follower节点日志都有延迟，总不能每次都将matchIndex到日志末尾的所有日志都发送给follower节点吧。所以才有了nextIndex[]，每次心跳包里包含了matchIndex到nextIndex的日志。nextIndex的另个作用也就是2.中的i,节点刚成为leader节点时nextIndex初始化leader节点日志长度(要不要减1取决代码怎么实现),设置的比较乐观。

### preIndex
Leader节点发送的心跳包里包含了preIndex，作用可以参考上面写的日志同步过程。
### commitIndex
当leader节点一个日志被超过一半的节点复制了那么改日志就被commit了，对raft本身来说commit没有用，但是调用raft的客户端需要知道哪些日志被commit了。**这里有个非常大的坑**，后面再提。
### applied index
raft需要通知调用raft的客户端哪些日志被commit了，因此单独开一个线程去通知，每次从applied index到当前commitIndex的日志。applied index也就是上一次已经通知过的commitIndex。
### Raft论文中限制条件总结
### Raft里的坑
1. matchIndex[]，论文里说matchIndex是**自增**的，但是怎么保证自增呢？
matchIndex不自增会有的问题：leader节点刚同步完log[20:22]，然后由于matchIndex没有变成23，而又变成了20，那么它又同步了一遍，如果总是反复同步log[20:22]就跳不出循环了。
matchIndex什么时候会不自增：一般情况下matchIndex总是自增的。但是如果leader发送了log[20:22]请求未被follower接收到，那么再次发送log[20:22]，这时候第一次发送的log[20:22]请求被follower接收了，于是更改matchIndex到23，然后leader发送log[23:24]，也得到响应，matchIndex改为25。这时候第二次发送的log[20:22]被follower接收了，leader获得响应，将matchIndex从25改成了23。
因为程序里要特别注意***别遗漏matchIndex必须自增***。
2. commitIndex
这个也是巨坑。论文没全部看完就去写代码都是泪。总结就是： Raft never commits log entries from previous terms by counting replicas。如果日志被复制到超过一半节点了不代表就可以更新commitIndex了，那个日志的term必须是当前term才行。这里就直接粘贴论文原图了。
![commit index](/img/commitIndex.PNG)
### Raft算法实现
总结起来经验就是保证一个节点明明是follower却干着leader的事情，然后就是前文提到的不要把并不是多线程的问题弄成了多线程问题。
从状态机那张图可以瞬间写出一个
```go
for {
	switch rf.role {
		case FOLLOWER:
			{
				rf.doFollower()
			}
		case CANDIDATE:
			{
				rf.doCandidate()
			}
		case LEADER:
			{
				rf.doLeader()
			}
		default:
			panic("unknown role " + rf.role)
		}
	}
}
```
保证从doLeader之类函数跳出执行doFollower()时别还是跑着doLeader的线程。
另外节点一边接收请求，一边发送请求，一边处理请求响应，这三者之间可能会修改了一个共享变量，引起线程安全问题，可以用锁来解决，也可以对于每个事件发送一个event到一个事件队列里，然后单线程去处理事件队列。
### Raft go实现的坑
1. 下面的代码会遗漏chan事件，别写。定时任务没执行可能是因为你写了下面这样的代码
```go
func main() {
		j := 0
		for {
			select {
			case <-time.Tick(time.Duration(10000)*time.Millisecond):
				{
					fmt.Printf("a\n")
				}
			case <-time.Tick(time.Duration(100)*time.Millisecond):
				{
					fmt.Printf("b\n")
				}
			}
		}
		fmt.Printf("%v\n", j)
}
```
因为两个chan同时有事件时select随机选一个执行
可以改成
```go
    func main() {
    	j := 0
    	ti := time.After(time.Duration(10000)*time.Millisecond)
		tj := time.Tick(time.Duration(100)*time.Millisecond)
		for {
    		select {
    		case <-ti:
    			{
    				fmt.Printf("a\n")
    				ti = time.After(time.Duration(10000)*time.Millisecond)
    			}
    		case <-tj:
    			{
    				fmt.Printf("b\n")
					tj := time.Tick(time.Duration(100)*time.Millisecond)
    			}
    		}
    	}
    }
```    
把chan拿到外面来，不要每次都返回新的chan，这样下次select时候会处理
2. 对于MIT 6.824
记得补全kill函数，因为实验里节点宕机重启不会把那个节点的线程全关掉，如果是leader节点，那它可能宕机了还在发送消息
```go
func (rf *Raft) Kill() {
	atomic.StoreInt32(&rf.dead, 1)
	rf.stop = true
}
```
再给个参考
```go
for !rf.stop{
	switch rf.role {
		case FOLLOWER:
			{
				rf.doFollower()
			}
		...
	}
}
```
