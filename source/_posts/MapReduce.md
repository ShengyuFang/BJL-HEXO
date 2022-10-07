---
title: MapReduce
date: 2022-10-05 12:51:00
categories: 分布式
---
MapReduce思想是分治算法，将原问题分解成小的子问题，最后聚合为最终结果。
### MapReduce过程
![MapReduce](/img/mapReduce.PNG)
* MapReduce包含了master，worker结点,处理过程分为map阶段与reduce阶段。
* MapReduce的worker结点会不停地向mater结点请求任务，当用户提交请求文件或SQL等请求后，master结点先将map任务返回给各个worker结点，每个map任务只处理文件/数据的某几个split分区。
* 当所有worker结点完成map任务表示map阶段已经结束，转到reduce阶段。这时候再请求master结点时，master结点会返回worker结点reduce任务。所有worker结点完成reduce任务后表示用户请求已经全部完成。
### WordCount的MapReduce
![WordCount](/img/WordCount.png)
WordCount任务是统计一个段文字中各单词词。图上展示的是WordCount的MapReduce过程。
MIT6.824 WordCount的输入是多个文件，简化了Split过程，与实际生产不同。实际生产输入只有一个文件，MapReduce库函数将输入数据分成多份，每份数据大小通常在16 - 64MB之间，Split过程由MapReduce自己完成。
假设已经Split出10份文件，有3台Map机器，2台reduce机器。某split文件内容为"long long time ago",由map结点2处理该文件。假设采用hash取余的方式处理key，并且hash(long)%2=0, hash(time)%2=0，hash(ago)%2=1。那么将得到临时文件
```
M-2-0 "long long time"
M-2-1 "ago"
```
所有split文件的map都处理完成，也就是Map阶段结束后再由reduce机器r0处理M-0-0,m-1-0,m-2-0得到输出文件MR-out-0, MR-out-0包含所有hash(单词)%2=0的单词的数量, 其他reduce结点以此类推。
### Java的MapReduce框架
Java内置了单机的MapReduce库，利用多线程计算各子问题，最后返回给主线程，比如ForkJoinPool，CompletableFuture。
### MapReduce思考
标题起为“思考”因为下面提出的问题不一定正确。
* 采用MapReduce框架的平台得自己实现map与reduce函数以对使用者屏蔽，比如hive。然而感觉MR不一定适用于很多情况
* MR一定需要执行完map阶段才能开始分配reduce任务吗？比如用归并算法对大文件排序采用MapReduce集群
* Split的粒度问题，怎样split，分配任务到机器更能利用集群的性能？
* 有哪些问题很容易改为流式计算，边读文件边处理也就是split的粒度为按行进行是不是可以提高集群利用率？
待了解流式计算再与MapReduce比较。