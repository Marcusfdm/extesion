// Function to save state to chrome.storage.local
function saveState() {
  chrome.storage.local.set({
    'dx_tracking_data': {
      data_collection: data_collection,
      tasks_data: tasks_data,
      todo_tasks: todo_tasks,
      currentTaskIndex: currentTaskIndex,
      currentPhase: currentPhase,
      currentTaskTimestamp: currentTaskTimestamp
    }
  });
}

let starttestdiv = document.querySelector(".main_page");
let finalpage = document.querySelector(".final_page");

// Variáveis globais
let data_collection = {
  "username" : "Admin",
  "seco_portal" : "default",
  "performed_tasks" : [],
  "interactions": [], // Store all interactions
  "navigation": []    // Store all navigation events
}
let tasks_data = [];   // Armazena as respostas para envio
let todo_tasks = [];   // Armazena as tasks recebidas em formato de objeto para serem feitas
let currentTaskIndex = -1; // Índice da task atual (-1 significa página incial e 0 significa primeira task e por ai vai)
let currentPhase = "initial"; // Pode ser "initial", "task", "review" ou "final", serve para configurara a exibição na tela
let currentTaskTimestamp = "Erro ao obter o timestamp"; // Armazena o timestamp da task atual

// Track all clicks within the extension
document.addEventListener('click', function(e) {
  try {
    const interaction = {
      type: 'click',
      element: e.target.tagName,
      elementId: e.target.id,
      elementClass: e.target.className,
      position: { x: e.clientX, y: e.clientY },
      timestamp: new Date().toISOString(),
      taskId: (currentTaskIndex >= 0 && todo_tasks.length > 0 && currentTaskIndex < todo_tasks.length) 
              ? todo_tasks[currentTaskIndex].id 
              : null,
      phase: currentPhase
    };
    
    data_collection.interactions.push(interaction);
    console.log("Interaction recorded:", interaction);
    
    // Save state after recording interaction
    saveState();
  } catch (error) {
    console.error("Error recording interaction:", error);
  }
});

// Comunicação com o background.js para pegar a aba ativa
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  try {
    if (request.action === "setActiveTabInfo") {
        data_collection.seco_portal = request.url;
        saveState();
    }
    // Listen for page navigation events from background.js
    else if (request.action === "pageNavigation") {
      data_collection.navigation.push({
        url: request.url,
        timestamp: request.timestamp,
        taskId: (currentTaskIndex >= 0 && todo_tasks.length > 0 && currentTaskIndex < todo_tasks.length) 
                ? todo_tasks[currentTaskIndex].id 
                : null
      });
      console.log("Navigation recorded:", request.url);
      saveState();
    }
  } catch (error) {
    console.error("Error processing message:", error);
  }
});

// Inicio da avaliação (passa para a primeira task)
document.getElementById("startTestButton").addEventListener("click", function () {
  starttestdiv.style.display = "none";
  currentTaskIndex = 0;
  currentPhase = "task";

  // Solicita a aba ativa para o background.js
  try {
    chrome.runtime.sendMessage({ action: "getActiveTabInfo" }, function(response) {
      if (chrome.runtime.lastError) {
        // Handle error, but don't throw - this suppresses the error
        console.log('Error sending message:', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error("Error sending message to background script:", error);
  }
  
  updateDisplay();
});

// Load state at the beginning
document.addEventListener("DOMContentLoaded", function() {
  chrome.storage.local.get('dx_tracking_data', function(result) {
    if (result.dx_tracking_data) {
      data_collection = result.dx_tracking_data.data_collection || {
        "username": "Admin",
        "seco_portal": "default",
        "performed_tasks": [],
        "interactions": [],
        "navigation": []
      };
      tasks_data = result.dx_tracking_data.tasks_data || [];
      todo_tasks = result.dx_tracking_data.todo_tasks || [];
      currentTaskIndex = result.dx_tracking_data.currentTaskIndex || -1;
      currentPhase = result.dx_tracking_data.currentPhase || "initial";
      currentTaskTimestamp = result.dx_tracking_data.currentTaskTimestamp || "Error getting timestamp";
      
      // Update display based on loaded state
      if (todo_tasks.length > 0) {
        updateDisplay();
      } else {
        // No tasks loaded yet, fetch them
        fetchTasks();
      }
    } else {
      // Initialize session ID and metadata
      data_collection.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      data_collection.startTime = new Date().toISOString();
      data_collection.userAgent = navigator.userAgent;
      data_collection.screenSize = { 
        width: window.screen.width, 
        height: window.screen.height 
      };
      
      // Fetch tasks as there's no saved state
      fetchTasks();
    }
    
    // Request active tab info
    try {
      chrome.runtime.sendMessage({ action: "getActiveTabInfo" }, function(response) {
        if (chrome.runtime.lastError) {
          console.log('Error sending message:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.error("Error sending message to background script:", error);
    }
  });
});

// Extract task fetching to a separate function
function fetchTasks() {
  fetch("http://127.0.0.1:5000/gettasks")
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(tasks => {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new Error('No tasks received from server');
      }

      const container = document.querySelector("#taskscontainer"); // Puxa o container que guarda as tasks no html

      tasks.forEach(task => {
        // Cria um wrapper para cada task (contendo a parte de tarefa e a de review)
        const taskWrapper = document.createElement("div");

        // Gera o HTML das questões iterando por cada questao que tem relacionada a task
        let questionsHTML = "";
        task.questions.forEach((question, index) => {
          questionsHTML += `
            <div class="question">
              <label for="question-${task.id}-${index}">${question.text}</label>
              <input class="input" type="text" id="question-${task.id}-${index}" name="question-${task.id}-${index}">
            </div>
          `;
        });

        // Estrutura da task e da review
        taskWrapper.innerHTML = `
          <div class="task" id="task${task.id}">
            <h1>Task ${task.id}</h1>
            <h2 id="task${task.id}_title" style="display: none;">${task.description}</h2>
            <h2 id="task${task.id}_startmassage">Start the task when you're ready</h2>
            <button id="startTask${task.id}Button">Start Task</button>
            <button id="finishTask${task.id}Button" style="display: none;">Finish</button>
            <button class="couldntsolve" id="couldntSolveTask${task.id}Button" style="display: none;">Couldn't solve it?</button>
          </div>
          <div class="task_review" id="task${task.id}_review">
            <h1>Task ${task.id} Review</h1>
            <h2>${task.description}</h2>
            <div class="task-questions">
              ${questionsHTML}
            </div>
            <button id="task${task.id}ReviewButton">Next</button>
          </div>
        `;

        container.appendChild(taskWrapper); // Colocar a task criada no container
        // Armazena o objeto da task para ser realizada
        todo_tasks.push(task);

        // Adiciona eventos aos botões da task para passar para a fase de review
        document.getElementById(`finishTask${task.id}Button`).addEventListener("click", () => {
          currentPhase = "review";
          // Record task completion event
          data_collection.interactions.push({
            type: 'task_complete',
            taskId: task.id,
            status: 'finished',
            timestamp: new Date().toISOString()
          });
          updateDisplay();
        });
        document.getElementById(`couldntSolveTask${task.id}Button`).addEventListener("click", () => {
          currentPhase = "review";
          // Record task abandonment event
          data_collection.interactions.push({
            type: 'task_complete',
            taskId: task.id,
            status: 'abandoned',
            timestamp: new Date().toISOString()
          });
          updateDisplay();
        });

        // Evento para iniciar a task e guardar o timestamp inicial
        document.getElementById(`startTask${task.id}Button`).addEventListener("click", () => {
          document.getElementById(`task${task.id}_startmassage`).style.display = "none";
          document.getElementById(`startTask${task.id}Button`).style.display = "none";
          document.getElementById(`finishTask${task.id}Button`).style.display = "block";
          document.getElementById(`couldntSolveTask${task.id}Button`).style.display = "block";
          document.getElementById(`task${task.id}_title`).style.display = "block";
          currentTaskTimestamp = new Date().toISOString(); // Salvar na global o timestamp inicial da task atual
          
          // Record task start event
          data_collection.interactions.push({
            type: 'task_start',
            taskId: task.id,
            timestamp: currentTaskTimestamp
          });
          
          saveState();
        });

        // Evento do botão Next na review
        document.getElementById(`task${task.id}ReviewButton`).addEventListener("click", () => {
          // Coleta as respostas
          const inputs = document.querySelectorAll(`#task${task.id}_review .task-questions input`);
          const answers = [];
          inputs.forEach((input, index) => {
            answers.push({
              question: task.questions[index].text,
              answer: input.value
            });
          });
          // Criar o objeto com os dados da task e adiciona no array
          tasks_data.push({
            id: task.id,
            title: task.title,
            description: task.description,
            initial_timestamp : currentTaskTimestamp,
            final_timestamp : new Date().toISOString(),
            answers: answers
          });
          // Avança para a próxima task ou para a página final se não houver mais tasks
          currentTaskIndex++;
          if (currentTaskIndex < todo_tasks.length) {
            currentPhase = "task";
          } else {
            currentPhase = "final";
          }
          updateDisplay();
        });
      });
      // Atualiza a exibição após gerar as tasks
      updateDisplay();
      
      // Save state after loading tasks
      saveState();
    })
    .catch(error => {
      const container = document.querySelector("#taskscontainer");
      container.innerHTML = `<h1>Erro</h1> <p>${error.message}</p>`;
      console.error("Erro ao carregar as tasks:", error);
    });
}

// Track scrolling behavior
document.addEventListener('scroll', function() {
  // Throttle the event to avoid excessive recordings
  if (!this.scrollTimeout) {
    this.scrollTimeout = setTimeout(() => {
      this.scrollTimeout = null;
      
      try {
        // Calculate scroll depth as percentage
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = document.documentElement.clientHeight;
        const scrollPercentage = (scrollTop / (scrollHeight - clientHeight)) * 100;
        
        data_collection.interactions.push({
          type: 'scroll',
          depth: Math.round(scrollPercentage),
          timestamp: new Date().toISOString(),
          taskId: (currentTaskIndex >= 0 && todo_tasks.length > 0 && currentTaskIndex < todo_tasks.length) 
                ? todo_tasks[currentTaskIndex].id 
                : null,
          phase: currentPhase
        });
        
        saveState();
      } catch (error) {
        console.error("Error recording scroll interaction:", error);
      }
    }, 500); // Record at most every 500ms
  }
});

// Função que atualiza a exibição com base na fase e na task atual
function updateDisplay() {
  try {
    // Esconde tudo
    starttestdiv.style.display = "none";
    finalpage.style.display = "none";
    document.querySelectorAll(".task").forEach(div => div.style.display = "none");
    document.querySelectorAll(".task_review").forEach(div => div.style.display = "none");

    if (currentPhase === "initial") {
      starttestdiv.style.display = "block";
    } else if (currentPhase === "task" && todo_tasks.length > 0 && currentTaskIndex >= 0 && currentTaskIndex < todo_tasks.length) {
      // Exibe a parte da tarefa da task atual
      const taskId = todo_tasks[currentTaskIndex].id;
      document.getElementById("task" + taskId).style.display = "block";
    } else if (currentPhase === "review" && todo_tasks.length > 0 && currentTaskIndex >= 0 && currentTaskIndex < todo_tasks.length) {
      // Exibe a parte de review da task atual
      const taskId = todo_tasks[currentTaskIndex].id;
      document.getElementById("task" + taskId + "_review").style.display = "block";
    } else if (currentPhase === "final") {
      finalpage.style.display = "block";
    }
    
    // Record display update event
    data_collection.interactions.push({
      type: 'display_update',
      newPhase: currentPhase,
      timestamp: new Date().toISOString(),
      taskId: (currentTaskIndex >= 0 && todo_tasks.length > 0 && currentTaskIndex < todo_tasks.length) 
              ? todo_tasks[currentTaskIndex].id 
              : null
    });
    
    // Save state after display update
    saveState();
  } catch (error) {
    console.error("Error updating display:", error);
    
    // Fallback to showing the main page in case of error
    starttestdiv.style.display = "block";
    finalpage.style.display = "none";
    document.querySelectorAll(".task").forEach(div => div.style.display = "none");
    document.querySelectorAll(".task_review").forEach(div => div.style.display = "none");
  }
}

// Botão para finalizar a avaliação e enviar os dados para o Flask
document.getElementById("finishevaluationbtn").addEventListener("click", function () {
  try {
    // Record end time
    data_collection.endTime = new Date().toISOString();
    
    // Enviando os dados para o backend Flask
    data_collection.performed_tasks = tasks_data;

    fetch("http://127.0.0.1:5000/submit_tasks", {
        method: "POST",
        headers: {
            "Content-Type": "application/json" // informar ao flask que o dado que esta sendo enviado é um json
        },
        body: JSON.stringify(data_collection)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => { // Agora com os dados convertidos, exibe na tela que foi enviado com sucesso
        console.log("Resposta do servidor:", data);
        alert("Dados enviados com sucesso");
        
        // Clear saved state after successful submission
        chrome.storage.local.remove('dx_tracking_data', function() {
          console.log('State cleared after successful submission');
        });
    })
    .catch(error => { //tratamento de erro
        console.error("Erro ao enviar os dados:", error);
        alert("Erro ao enviar os dados: " + error.message);
    });
  } catch (error) {
    console.error("Error finalizing evaluation:", error);
    alert("Erro ao finalizar avaliação: " + error.message);
  }
});