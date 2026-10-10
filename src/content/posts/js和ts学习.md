---
title: "js和ts学习"
description: ""
pubDate: 2026-05-28
tags: [飞书同步]
---
**js和ts学习**

学习资料 **阮一峰 ES6 + 廖雪峰 JS**搞定刚需 JS ai工具 xcatliu 文档

**1.js学习**

学到promise前结束

**1.廖雪峰的js**

https://www.liaoxuefeng.com/wiki/1022910821149312

**1.简介**

JavaScript是一种运行在浏览器中的解释型的编程语言

一个合格的开发人员应该精通JavaScript和其他编程语言

JavaScript  
alert('我要学JavaScript!');

**2.快速入门**

JavaScript代码可以直接嵌在网页的任何地方，不过通常我们都把JavaScript代码放到<head>中

第二种方法是把JavaScript代码放到一个单独的.js文件，然后在HTML中通过<script src="..."></script>引入这个文件

**1.基本语法**

以;结尾,以{}包裹

以//开头直到行末的字符被视为行注释，注释是给开发人员看到，JavaScript引擎会自动忽略

另一种块注释是用/\*...\*/把多行字符包裹起来，把一大“块”视为一个注释

**1.变量声明**

![](/images/NLBjwN4m1iP1PHkLVescTlbhnkc/img-1.png)

**优先用 const**：绝大多数不需要修改的数据（固定数值、配置、对象引用）都用它，代码更安全；

**其次用 let**：只有确定值会发生变化时（比如计数器、循环变量）才用；

**尽量不用 var**：旧语法有很多坑（变量污染、作用域混乱），现代项目已废弃。

JavaScript  
const pi=3.14; #必须在变量声明时就赋值  
let x=1;  
x=2; #后面的变量可以重新赋值

**2.条件判断if语句**

JavaScript  
if (条件) {// 条件为 true 时，执行这里的代码  
}  
  
if (x < y) {  
z = 4;  
}  
else {  
z = 5;  
}

**3.数据类型和变量**

JavaScript不区分整数和浮点数，统一用Number表示

字符串是以单引号'或双引号"括起来的任意文本

布尔值和布尔代数的表示完全一致，一个布尔值只有true、false两种值，要么是true，要么是false

&&运算是与运算，只有所有都为true，&&运算结果才是true

||运算是或运算，只要其中有一个为true，||运算结果就是true

!运算是非运算，它是一个单目运算符，把true变成false，false变成true

由于JavaScript这个设计缺陷，_不要_使用==比较，始终坚持使用===比较

console.log 是 JavaScript 里的 **「打印输出工具」**

null表示一个“空”的值，它和0以及空字符串''不同，0是一个数值，''表示长度为0的字符串，而null表示“空”

数组是一组按顺序排列的集合，集合的每个值称为元素。数组用\[\]表示，元素之间用,分隔。

JavaScript的对象是一组由键-值组成的无序集合,对象的键都是字符串类型，值可以是任意数据类型。

要获取一个对象的属性，我们用对象变量.属性名的方式：

在JavaScript中，使用等号=对变量进行赋值。可以把任意数据类型赋值给变量，同一个变量可以反复赋值，而且可以是不同类型的变量，但是要注意只能用var申明一次

JavaScript  
const arr = \[1, 2, 3.14, 'Hello', null, true\];  
arr\[0\]; // 返回索引为0的元素，即1  
arr\[5\]; // 返回索引为5的元素，即true  
arr\[6\]; // 索引超出了范围，返回undefined  
console.log(arr\[0\], arr\[5\], arr\[6\]);  
  
const person = {  
name: 'Bob',  
age: 20,  
tags: \['js', 'web', 'mobile'\],  
city: 'Beijing',  
hasCar: true,  
zipcode: null  
};  
person.name; // 'Bob'  
person.zipcode; // null

启用strict模式的方法是在JavaScript代码的第一行写上：

在strict模式下运行的JavaScript代码，强制通过var申明变量，未使用var申明变量就使用的，将导致运行错误。

JavaScript  
'use strict';

**多行字符串**

由于多行字符串用\\n写起来比较费事，所以最新的ES6标准新增了一种多行字符串的表示方法，用反引号\`...\`表示：

JavaScript  
\`这是一个  
多行  
字符串\`;

要把多个字符串连接起来，可以用+号连接：

如果有很多变量需要连接，用+号就比较麻烦。ES6新增了一种模板字符串，表示方法和上面的多行字符串一样，但是它会自动替换字符串中的变量：

JavaScript  
let name = '小明';  
let age = 20;  
let message = \`你好, ${name}, 你今年${age}岁了!\`;  
alert(message);

substring()返回指定索引区间的子串：

JavaScript  
let s = 'hello, world'  
s.substring(0, 5); // 从索引0开始到5（不包括5），返回'hello'  
s.substring(7); // 从索引7开始到结束，返回'world'

**数组**

Array可以通过索引把对应的元素修改为新的值，因此，对Array的索引进行赋值会直接修改这个Array

JavaScript  
// Array index:  
let arr = \['A', 'B', 'C'\];  
arr\[1\] = 99;  
console.log(arr); // arr现在变为\['A', 99, 'C'\]  
console.log(arr\[1\]); // 99

slice()就是对应String的substring()版本，它截取Array的部分元素，然后返回一个新的Array：

JavaScript  
let arr = \['A', 'B', 'C', 'D', 'E', 'F', 'G'\];  
arr.slice(0, 3); // 从索引0开始，到索引3结束，但不包括索引3: \['A', 'B', 'C'\]  
arr.slice(3); // 从索引3开始到结束: \['D', 'E', 'F', 'G'\]

sort()可以对当前Array进行排序，它会直接修改当前Array的元素位置，直接调用时，按照默认顺序排序：

JavaScript  
let arr = \['B', 'C', 'A'\];  
arr.sort();  
arr; // \['A', 'B', 'C'\]

reverse()把整个Array的元素给调个个，也就是反转：

JavaScript  
let arr = \['one', 'two', 'three'\];  
arr.reverse();  
arr; // \['three', 'two', 'one'\]

splice()方法是修改Array的“万能方法”，它可以从指定的索引开始删除若干元素，然后再从该位置添加若干元素：

JavaScript  
let arr = \['Microsoft', 'Apple', 'Yahoo', 'AOL', 'Excite', 'Oracle'\];  
// 从索引2开始删除3个元素,然后再添加两个元素:  
arr.splice(2, 3, 'Google', 'Facebook'); // 返回删除的元素 \['Yahoo', 'AOL', 'Excite'\]  
arr; // \['Microsoft', 'Apple', 'Google', 'Facebook', 'Oracle'\]// 只删除,不添加:  
arr.splice(2, 2); // \['Google', 'Facebook'\]  
arr; // \['Microsoft', 'Apple', 'Oracle'\]// 只添加,不删除:  
arr.splice(2, 0, 'Google', 'Facebook'); // 返回\[\],因为没有删除任何元素  
arr; // \['Microsoft', 'Apple', 'Google', 'Facebook', 'Oracle'\]

concat()方法把当前的Array和另一个Array连接起来，并返回一个新的Array：

JavaScript  
let arr = \['A', 'B', 'C'\];  
let added = arr.concat(\[1, 2, 3\]);  
added; // \['A', 'B', 'C', 1, 2, 3\]  
arr; // \['A', 'B', 'C'\]

join()方法是一个非常实用的方法，它把当前Array的每个元素都用指定的字符串连接起来，然后返回连接后的字符串：

JavaScript  
let arr = \['A', 'B', 'C', 1, 2, 3\];  
arr.join('-'); // 'A-B-C-1-2-3'

**对象**

JavaScript的对象是一种无序的集合数据类型，它由若干键值对组成。

JavaScript用一个{...}表示一个对象，键值对以xxx: xxx形式申明，用,隔开。注意，最后一个键值对不需要在末尾加,，如果加了，有的浏览器（如低版本的IE）将报错。

JavaScript  
let xiaoming = {  
name: '小明',  
birth: 1990,  
school: 'No.1 Middle School',  
height: 1.70,  
weight: 65,  
score: null  
};

有效变量名 **字母 / 下划线 /**

访问属性是通过.操作符完成的，但这要求属性名必须是一个有效的变量名。如果属性名包含特殊字符，就必须用''括起来：

JavaScript  
let xiaohong = {  
name: '小红',  
'middle-school': 'No.1 Middle School'  
};

xiaohong的属性名middle-school不是一个有效的变量，就需要用''括起来。访问这个属性也无法使用.操作符，必须用\['xxx'\]来访问：

JavaScript  
xiaohong\['middle-school'\]; // 'No.1 Middle School'  
xiaohong\['name'\]; // '小红'  
xiaohong.name; // '小红'

如果我们要检测xiaoming是否拥有某一属性，可以用in操作符.不过要小心，如果in判断一个属性存在，这个属性不一定是xiaoming的，它可能是xiaoming继承得到的：

要判断一个属性是否是xiaoming自身拥有的，而不是继承得到的，可以用hasOwnProperty()方法：

JavaScript  
let xiaoming = {  
name: '小明'  
};  
xiaoming.hasOwnProperty('name'); // true  
xiaoming.hasOwnProperty('toString'); // false

**条件判断**

JavaScript使用if () { ... } else { ... }来进行条件判断。

JavaScript  
let age = 20;  
if (age >= 18) { // 如果age >= 18为true，则执行if语句块console.log('adult');  
} else { // 否则执行else语句块console.log('teenager');  
}

**循环**

JavaScript的循环有两种，一种是for循环，通过初始条件、结束条件和递增条件来循环执行语句块：

JavaScript  
let x = 0;  
let i;  
for (i=1; i<=10000; i++) {  
x = x + i;  
}  
x; // 50005000

让我们来分析一下for循环的控制条件：

*   i=1 这是初始条件，将变量i置为1；
*   i<=10000 这是判断条件，满足时就继续循环，不满足就退出循环；
*   i++ 这是每次循环后的递增条件，由于每次循环后变量i都会加1，因此它终将在若干次循环后不满足判断条件i<=10000而退出循环。

while循环只有一个判断条件，条件满足，就不断循环，条件不满足时则退出循环。比如我们要计算100以内所有奇数之和，可以用while循环实现：

JavaScript  
let x = 0;  
let n = 99;  
while (n > 0) {  
x = x + n;  
n = n - 2;  
}  
x; // 2500

最后一种循环是do { ... } while()循环，它和while循环的唯一区别在于，不是在每次循环开始的时候判断条件，而是在每次循环完成的时候判断条件：

JavaScript  
let n = 0;  
do {  
n = n + 1;  
} while (n < 100);  
n; // 100

**map和set**

Map是一组键值对的结构，具有极快的查找速度。

JavaScript  
let m = new Map(\[\['Michael', 95\], \['Bob', 75\], \['Tracy', 85\]\]);  
m.get('Michael'); // 95

JavaScript  
let m = new Map(); // 空Map  
m.set('Adam', 67); // 添加新的key-value  
m.set('Bob', 59);  
m.has('Adam'); // 是否存在key 'Adam': true  
m.get('Adam'); // 67  
m.delete('Adam'); // 删除key 'Adam'  
m.get('Adam'); // undefined

Set和Map类似，也是一组key的集合，但不存储value。由于key不能重复，所以，在Set中，没有重复的key。

要创建一个Set，需要提供一个Array作为输入，或者直接创建一个空Set：

JavaScript  
let s1 = new Set(); // 空Setlet s2 = new Set(\[1, 2, 3\]); // 含1, 2, 3

**Iterable**

ES6标准引入了新的iterable类型，Array、Map和Set都属于iterable类型。

具有iterable类型的集合可以通过新的for ... of循环来遍历。

JavaScript  
let a = \['A', 'B', 'C'\];  
let s = new Set(\['A', 'B', 'C'\]);  
let m = new Map(\[\[1, 'x'\], \[2, 'y'\], \[3, 'z'\]\]);  
for (let x of a) { // 遍历Arrayconsole.log(x);  
}  
for (let x of s) { // 遍历Setconsole.log(x);  
}  
for (let x of m) { // 遍历Mapconsole.log(x\[0\] + '=' + x\[1\]);

更好的方式是直接使用iterable内置的forEach方法，它接收一个函数，每次迭代就自动回调该函数。以Array为例：

JavaScript  
let a = \['A', 'B', 'C'\];  
a.forEach(function (element, index, array) {  
// element: 指向当前元素的值  
// index: 指向当前索引  
// array: 指向Array对象本身  
console.log(\`${element}, index = ${index}\`);  
});  
  
A, index = 0  
B, index = 1  
C, index = 2

**3.函数**

**1.函数的定义和调用**

在JavaScript中，定义函数的方式如下：

JavaScript  
function abs(x) {  
if (x >= 0) {  
return x;  
} else {  
return -x;  
}  
}

上述abs()函数的定义如下：

*   function指出这是一个函数定义；
*   abs是函数的名称；
*   (x)括号内列出函数的参数，多个参数以,分隔；
*   { ... }之间的代码是函数体，可以包含若干语句，甚至可以没有任何语句。

第二种定义函数的方式如下：

JavaScript  
let abs = function (x) {  
if (x >= 0) {  
return x;  
} else {  
return -x;  
}  
};#注意加;表示赋值结束

调用函数时，按顺序传入参数即可

rest参数只能写在最后，前面用...标识，从运行结果可知，传入的参数先绑定a、b，多余的参数以数组形式交给变量rest

JavaScript  
function foo(a, b, ...rest) {  
console.log('a = ' + a);  
console.log('b = ' + b);  
console.log(rest);  
}  
  
foo(1, 2, 3, 4, 5);  
// 结果:// a = 1// b = 2// Array \[ 3, 4, 5 \]foo(1);  
// 结果:// a = 1// b = undefined// Array \[\]

**2.变量作用域与解构赋值**

在JavaScript中，用var申明的变量实际上是有作用域的。

如果一个变量在函数体内部申明，则该变量的作用域为整个函数体，在函数体外不可引用该变量

内部函数可以访问外部函数定义的变量，反过来则不行

JavaScript的函数在查找变量时从自身函数定义开始，从“内”向“外”查找。如果内部函数定义了与外部函数重名的变量，则内部函数的变量将“屏蔽”外部函数的变量。

**3.方法**

在一个对象中绑定函数，称为这个对象的方法。

JavaScript  
let xiaoming = {  
name: '小明',  
birth: 1990,  
age: function () {  
let y = new Date().getFullYear();  
return y - this.birth;  
}  
};  
  
xiaoming.age; // function xiaoming.age()  
xiaoming.age(); // 今年调用是25,明年调用就变成26了

在一个方法内部，this是一个特殊变量，它始终指向当前对象，也就是xiaoming这个变量。所this.birth可以拿到xiaoming的birth属性。

要指定函数的this指向哪个对象，可以用函数本身的apply方法，它接收两个参数，第一个参数就是需要绑定的this变量，第二个参数是Array，表示函数本身的参数。用apply修复getAge()调用：

JavaScript  
function getAge() {  
let y = new Date().getFullYear();  
return y - this.birth;  
}  
  
let xiaoming = {  
name: '小明',  
birth: 1990,  
age: getAge  
};  
  
xiaoming.age(); // 25  
getAge.apply(xiaoming, \[\]); // 25, this指向xiaoming, 参数为空

另一个与apply()类似的方法是call()，唯一区别是：

*   apply()把参数打包成Array再传入；
*   call()把参数按顺序传入。

比如调用Math.max(3, 5, 4)，分别用apply()和call()实现如下：

JavaScript  
Math.max.apply(null, \[3, 5, 4\]); // 5  
Math.max.call(null, 3, 5, 4); // 5

**装饰器**

利用apply()，我们还可以动态改变函数的行为。

JavaScript  
'use strict';  
  
let count = 0;  
let oldParseInt = parseInt; // 保存原函数  
  
window.parseInt = function () {  
count += 1;  
return oldParseInt.apply(null, arguments); // 调用原函数  
};  
  
// 测试:  
parseInt('10');  
parseInt('20');  
parseInt('30');  
console.log('count = ' + count); // 3

**4.高阶函数**

JavaScript的函数其实都指向某个变量。既然变量可以指向函数，函数的参数能接收变量，那么一个函数就可以接收另一个函数作为参数，这种函数就称之为高阶函数。

一个最简单的高阶函数：

JavaScript  
function add(x, y, f) {  
return f(x) + f(y);  
}

Map

Reduce

Filter

Sort

Every() find findIndex forEach

**5.闭包**

**6.箭头函数**

为什么叫箭头函数？因为它的定义用的就是一个箭头：

JavaScript  
x => x \* x

上面的箭头函数相当于：

JavaScript  
function (x) {  
return x \* x;  
}

**7.标签函数**

**8.生成器**

generator跟函数很像，定义如下：

JavaScript  
function\* foo(x) {  
yield x + 1;  
yield x + 2;  
return x + 3;  
}

generator和函数不同的是，generator由function\*定义（注意多出的\*号），并且，除了return语句，还可以用yield返回多次。

**4.标准对象**

在JavaScript的世界里，一切都是对象。

但是某些对象还是和其他对象不太一样。为了区分对象的类型，我们用typeof操作符获取对象的类型，它总是返回一个字符串

包装对象用new创建：

JavaScript  
let n = new Number(123); // 123,生成了新的包装类型  
let b = new Boolean(true); // true,生成了新的包装类型  
let s = new String('str'); // 'str',生成了新的包装类型

虽然包装对象看上去和原来的值一模一样，显示出来也是一模一样，但他们的类型已经变为object了！

总结一下，有这么几条规则需要遵守：

*   不要使用new Number()、new Boolean()、new String()创建包装对象；
*   用parseInt()或parseFloat()来转换任意类型到number；
*   用String()来转换任意类型到string，或者直接调用某个对象的toString()方法；
*   通常不必把任意类型转换为boolean再判断，因为可以直接写if (myVar) {...}；
*   typeof操作符可以判断出number、boolean、string、function和undefined；
*   判断Array要使用Array.isArray(arr)；
*   判断null请使用myVar === null；
*   判断某个全局变量是否存在用typeof window.myVar === 'undefined'；
*   函数内部判断某个变量是否存在用typeof myVar === 'undefined'。

**正则表达式**

正则表达式是一种用来匹配字符串的强有力的武器。它的设计思想是用一种描述性的语言来给字符串定义一个规则，凡是符合规则的字符串，我们就认为它“匹配”了，否则，该字符串就是不合法的。

在正则表达式中，如果直接给出字符，就是精确匹配。用\\d可以匹配一个数字，\\w可以匹配一个字母或数字，所以：

*   '00\\d'可以匹配'007'，但无法匹配'00A'；
*   '\\d\\d\\d'可以匹配'010'；
*   '\\w\\w'可以匹配'js'；
*   \\s可以匹配一个空格（也包括Tab等空白符）

.可以匹配任意字符，所以：

*   'js.'可以匹配'jsp'、'jss'、'js!'等等。

要匹配变长的字符，在正则表达式中，用\*表示任意个字符（包括0个），用+表示至少一个字符，用?表示0个或1个字符，用{n}表示n个字符，用{n,m}表示n-m个字符：

JavaScript有两种方式创建一个正则表达式：

第一种方式是直接通过/正则表达式/写出来，第二种方式是通过new RegExp('正则表达式')创建一个RegExp对象。

两种写法是一样的：

JavaScript  
let re1 = /ABC\\-001/;  
let re2 = new RegExp('ABC\\\\-001');  
  
re1; // /ABC\\-001/  
re2; // /ABC\\-001/

先看看如何判断正则表达式是否匹配：

JavaScript  
let re = /^\\d{3}\\-\\d{3,8}$/;  
re.test('010-12345'); // true  
re.test('010-1234x'); // false  
re.test('010 12345'); // false

RegExp对象的test()方法用于测试给定的字符串是否符合条件。

除了简单地判断是否匹配之外，正则表达式还有提取子串的强大功能。用()表示的就是要提取的分组（Group）。比如：

^(\\d{3})-(\\d{3,8})$分别定义了两个组，可以直接从匹配的字符串中提取出区号和本地号码：

JavaScript  
let re = /^(\\d{3})-(\\d{3,8})$/;  
re.exec('010-12345'); // \['010-12345', '010', '12345'\]  
re.exec('010 12345'); // null

JavaScript的正则表达式还有几个特殊的标志，最常用的是g，表示全局匹配：

JavaScript  
let r1 = /test/g;  
// 等价于:let r2 = new RegExp('test', 'g');

**Json**

JSON是JavaScript Object Notation的缩写，它是一种数据交换格式。

*   number：和JavaScript的number完全一致；
*   boolean：就是JavaScript的true或false；
*   string：就是JavaScript的string；
*   null：就是JavaScript的null；
*   array：就是JavaScript的Array表示方式——\[\]；
*   object：就是JavaScript的{ ... }表示方式。

并且，JSON还定死了字符集必须是UTF-8，表示多语言就没有问题了。为了统一解析，JSON的字符串规定必须用双引号""，Object的键也必须用双引号""。

把任何JavaScript对象变成JSON，就是把这个对象序列化成一个JSON格式的字符串，这样才能够通过网络传递给其他计算机。

如果我们收到一个JSON格式的字符串，只需要把它反序列化成一个JavaScript对象，就可以在JavaScript中直接使用这个对象了。

第二个参数用于控制如何筛选对象的键值，如果我们只想输出指定的属性，可以传入Array：

JavaScript  
JSON.stringify(xiaoming, \['name', 'skills'\], ' ');

拿到一个JSON格式的字符串，我们直接用JSON.parse()把它变成一个JavaScript对象：

**5.面向对象编程**

JavaScript的面向对象编程和大多数其他语言如Java、C#的面向对象编程都不太一样。如果你熟悉Java或C#，很好，你一定明白面向对象的两个基本概念：

1.  类：类是对象的类型模板，例如，定义Student类来表示学生，类本身是一种类型，Student表示学生类型，但不表示任何具体的某个学生；
2.  实例：实例是根据类创建的对象，例如，根据Student类可以创建出xiaoming、xiaohong、xiaojun等多个实例，每个实例表示一个具体的学生，他们全都属于Student类型。

所以，类和实例是大多数面向对象编程语言的基本概念。

不过，在JavaScript中，这个概念需要改一改。JavaScript不区分类和实例的概念，而是通过原型（prototype）来实现面向对象编程。

原型是指当我们想要创建xiaoming这个具体的学生时，我们并没有一个Student类型可用。那怎么办？恰好有这么一个现成的对象：

JavaScript  
let robot = {  
name: 'Robot',  
height: 1.6,  
run: function () {  
console.log(this.name + ' is running...');  
}  
};

我们看这个robot对象有名字，有身高，还会跑，有点像小明，干脆就根据它来“创建”小明得了！

于是我们把它改名为Student，然后创建出xiaoming：

JavaScript  
let Student = {  
name: 'Robot',  
height: 1.2,  
run: function () {  
console.log(this.name + ' is running...');  
}  
};  
  
let xiaoming = {  
name: '小明'  
};  
  
xiaoming.\_\_proto\_\_ = Student;

注意最后一行代码把xiaoming的原型指向了对象Student，看上去xiaoming仿佛是从Student继承下来的：

JavaScript  
xiaoming.name; // '小明'  
xiaoming.run(); // 小明 is running...

当我们用obj.xxx访问一个对象的属性时，JavaScript引擎先在当前对象上查找该属性，如果没有找到，就到其原型对象上找，如果还没有找到，就一直上溯到Object.prototype对象，最后，如果还没有找到，就只能返回undefined。

除了直接用{ ... }创建一个对象外，JavaScript还可以用一种构造函数的方法来创建对象。它的用法是，先定义一个构造函数：

JavaScript  
function Student(name) {  
this.name = name;  
this.hello = function () {  
alert('Hello, ' + this.name + '!');  
}  
}

你会问，咦，这不是一个普通函数吗？

这确实是一个普通函数，但是在JavaScript中，可以用关键字new来调用这个函数，并返回一个对象：

JavaScript  
let xiaoming = new Student('小明');  
xiaoming.name; // '小明'  
xiaoming.hello(); // Hello, 小明!

_注意_，如果不写new，这就是一个普通函数，它返回undefined。但是，如果写了new，它就变成了一个构造函数，它绑定的this指向新创建的对象，并默认返回this，也就是说，不需要在最后写return this;。

**6.浏览器**

由于JavaScript的出现就是为了能在浏览器中运行，所以，浏览器自然是JavaScript开发者必须要关注的。

**7.错误处理**

使用try ... catch ... finally处理错误时，我们编写的代码如下

JavaScript  
let r1, r2, s = null;  
try {  
r1 = s.length; // 此处应产生错误  
r2 = 100; // 该语句不会执行  
} catch (e) {  
console.log('出错了：' + e);  
} finally {  
console.log('finally');  
}  
console.log('r1 = ' + r1); // r1应为undefined  
console.log('r2 = ' + r2); // r2应为undefined  

所以，有错误发生时，执行流程像这样：

1.  先执行try { ... }的代码；
2.  执行到出错的语句时，后续语句不再继续执行，转而执行catch (e) { ... }代码；
3.  最后执行finally { ... }代码。

**8.jquery**

$

$是著名的jQuery符号。实际上，jQuery把所有功能全部封装在一个全局变量jQuery中，而$也是一个合法的变量名，它是变量jQuery的别名：

**9.node.js**

在Node上运行的JavaScript相比其他后端开发语言有何优势？

最大的优势是借助JavaScript天生的事件驱动机制加V8高性能引擎，使编写高性能Web服务轻而易举。

其次，JavaScript语言本身是完善的函数式语言，在前端开发时，开发人员往往写得比较随意，让人感觉JavaScript就是个“玩具语言”。但是，在Node环境下，通过模块化的JavaScript代码，加上函数式编程，并且无需考虑浏览器兼容性问题，直接使用最新的ECMAScript 6标准，可以完全满足工程上的需求。

npm是什么东西？npm其实是Node.js的包管理工具（package manager）。

我们把hello.js改造一下，创建一个函数，这样我们就可以在其他地方调用这个函数：

JavaScript  
'use strict';  
  
const s = 'Hello';  
  
function greet(name) {  
console.log(s + ', ' + name + '!');  
}  
  
module.exports = greet;

函数greet()是我们在hello模块中定义的，你可能注意到最后一行是一个奇怪的赋值语句，它的意思是，把函数greet作为模块的输出暴露出去，这样其他模块就可以使用greet函数了。

要在模块中对外输出变量，用：

JavaScript  
module.exports = variable;

输出的变量可以是任意对象、函数、数组等等。

要引入其他模块输出的对象，用：

JavaScript  
const foo = require('other\_module');

引入的对象具体是什么，取决于引入模块输出的对象。

Node内置了许多模块，可以从Node.js的[在线文档](https://nodejs.org/api/)查询所有模块信息。

以crypto模块的randomInt()函数为例，导入模块有两种方法：

方法一：使用传统的require()：

JavaScript  
const { randomInt } = require('node:crypto');  
const n = randomInt(0, 100); // 0~100之间的随机数console.log(n);

方法二：使用import关键字导入ESM模块：

JavaScript  
import { randomInt } from 'node:crypto';  
const n = randomInt(0, 100); // 0~100之间的随机数console.log(n);

**10.web开发**

**2.es6**

https://es6.ruanyifeng.com/

**1.let和const**

let

ES6 新增了let命令，用来声明变量。它的用法类似于var，但是所声明的变量，只在let命令所在的代码块内有效。let命令改变了语法行为，它所声明的变量一定要在声明后使用，否则报错。

let不允许在相同作用域内，重复声明同一个变量。

Const

const声明一个只读的常量。一旦声明，常量的值就不能改变。

**2.变量的解构赋值**

数组

JavaScript  
let \[a, b, c\] = \[1, 2, 3\];

对象

JavaScript  
let { foo, bar } = { foo: 'aaa', bar: 'bbb' };  
foo // "aaa"  
bar // "bbb"

字符串

JavaScript  
const \[a, b, c, d, e\] = 'hello';  
a // "h"  
b // "e"  
c // "l"  
d // "l"  
e // "o"

**2.ts学习**

**xcatliu TS 入门教程（新手速成首选）**[https://ts.xcatliu.com/](https://ts.xcatliu.com/)

**1.简介**

从 TypeScript 的名字就可以看出来，「类型」是其最核心的特性。

TypeScript 是静态类型

类型系统按照「类型检查的时机」来分类，可以分为动态类型和静态类型。

动态类型是指在运行时才会进行类型检查，这种语言的类型错误往往会导致运行时错误。JavaScript 是一门解释型语言(\[4\])，没有编译阶段，所以它是动态类型，以下这段代码在运行时才会报错：

JavaScript  
let foo = 1;  
foo.split(' ');// Uncaught TypeError: foo.split is not a function// 运行时会报错（foo.split 不是一个函数），造成线上 bug

静态类型是指编译阶段就能确定每个变量的类型，这种语言的类型错误往往会导致语法错误。TypeScript 在运行前需要先编译为 JavaScript，而在编译阶段就会进行类型检查，所以 TypeScript 是静态类型，这段 TypeScript 代码在编译阶段就会报错了：

TypeScript  
let foo = 1;  
foo.split(' ');// Property 'split' does not exist on type 'number'.// 编译时会报错（数字没有 split 方法），无法通过编译

TypeScript 非常适用于大型项目——这是显而易见的，类型系统可以为大型项目带来更高的可维护性，以及更少的 bug。

什么是 TypeScript？

*   TypeScript 是添加了类型系统的 JavaScript，适用于任何规模的项目。
*   TypeScript 是一门静态类型、弱类型的语言。
*   TypeScript 是完全兼容 JavaScript 的，它不会修改 JavaScript 运行时的特性。
*   TypeScript 可以编译为 JavaScript，然后运行在浏览器、Node.js 等任何能运行 JavaScript 的环境中。
*   TypeScript 拥有很多编译选项，类型检查的严格程度由你决定。
*   TypeScript 可以和 JavaScript 共存，这意味着 JavaScript 项目能够渐进式的迁移到 TypeScript。
*   TypeScript 增强了编辑器（IDE）的功能，提供了代码补全、接口提示、跳转到定义、代码重构等能力。
*   TypeScript 拥有活跃的社区，大多数常用的第三方库都提供了类型声明。
*   TypeScript 与标准同步发展，符合最新的 ECMAScript 标准（stage 3）。

**2.基础**

**1.原始数据类型**

布尔值是最基础的数据类型，在 TypeScript 中，使用 boolean 定义布尔值类型：

TypeScript  
let isDone: boolean = false;  
// 编译通过  
// 后面约定，未强调编译错误的代码片段，默认为编译通过

数值 使用 number 定义数值类型：

TypeScript  
let decLiteral: number = 6;let hexLiteral: number = 0xf00d;  
// ES6 中的二进制表示法  
let binaryLiteral: number = 0b1010;  
// ES6 中的八进制表示法  
let octalLiteral: number = 0o744;  
let notANumber: number = NaN;  
let infinityNumber: number = Infinity;

编译结果：

JavaScript  
var decLiteral = 6;  
var hexLiteral = 0xf00d;  
// ES6 中的二进制表示法  
var binaryLiteral = 10;  
// ES6 中的八进制表示法  
var octalLiteral = 484;  
var notANumber = NaN;  
var infinityNumber = Infinity;
