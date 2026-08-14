#include "VantageGameMode.h"

#include "CodeLock.h"
#include "DesertBuilder.h"
#include "ObjectiveCache.h"
#include "VantageCharacter.h"
#include "VantageHUD.h"
#include "ZombieCharacter.h"

#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerStart.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogVantage, Log, All);

AVantageGameMode::AVantageGameMode()
{
	DefaultPawnClass = AVantageCharacter::StaticClass();
	HUDClass = AVantageHUD::StaticClass();
}

void AVantageGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	EnsureLevelBuilt();
}

AActor* AVantageGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
	// This runs inside RestartPlayer, before the pawn exists. Building here is
	// the safety net that makes the InitGame ordering assumption non-critical.
	EnsureLevelBuilt();

	if (SpawnPoint)
	{
		return SpawnPoint;
	}

	return Super::ChoosePlayerStart_Implementation(Player);
}

void AVantageGameMode::StartPlay()
{
	EnsureLevelBuilt();
	Super::StartPlay();

	// First wave gets a breather so the player can look around before it lands.
	BeginIntermission();
}

void AVantageGameMode::EnsureLevelBuilt()
{
	if (bLevelBuilt)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	bLevelBuilt = true;

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	if (ADesertBuilder* Builder = World->SpawnActor<ADesertBuilder>(
		FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
	{
		Builder->Build();
	}
	else
	{
		UE_LOG(LogVantage, Error, TEXT("Failed to spawn ADesertBuilder; the map will be empty."));
	}

	// Held on to directly rather than left for FindPlayerStart to discover, so
	// the spawn point does not depend on actor iteration order.
	SpawnPoint = World->SpawnActor<APlayerStart>(SpawnLocation, FRotator::ZeroRotator, SpawnParams);

	// Facing back down the room toward the stairs, so you meet it head on.
	Lock = World->SpawnActor<ACodeLock>(ADesertBuilder::LockLocation, FRotator(0.f, 90.f, 0.f), SpawnParams);
	ArmLock();

	// Cheap poll rather than a per-frame check on the character: extraction only
	// matters once, and a third of a second is well inside human reaction time.
	GetWorldTimerManager().SetTimer(
		ExtractionTimer, this, &AVantageGameMode::CheckExtraction, 0.33f, true);

	UE_LOG(LogVantage, Log, TEXT("Level built. Spawn point at %s, lock at %s."),
		*SpawnLocation.ToCompactString(), *ADesertBuilder::LockLocation.ToCompactString());
}

void AVantageGameMode::ArmLock()
{
	// Fresh digits every run, so the combination cannot be memorised between
	// attempts and the plaque is worth walking to.
	Combination.Reset();
	for (int32 Index = 0; Index < 4; ++Index)
	{
		Combination.Add(FMath::RandRange(0, 9));
	}

	bLockOpen = false;

	if (Lock)
	{
		Lock->SetCombination(Combination);
	}

	UE_LOG(LogVantage, Log, TEXT("Vault combination for this run: %d%d%d%d"),
		Combination[0], Combination[1], Combination[2], Combination[3]);
}

bool AVantageGameMode::IsPlayerNearVault() const
{
	const UWorld* World = GetWorld();
	const APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	const APawn* Player = PC ? PC->GetPawn() : nullptr;
	if (!Player)
	{
		return false;
	}

	// Generous, because the marker should switch to the lock while he is still
	// outside rather than the instant he crosses the threshold.
	return FVector::DistSquared2D(Player->GetActorLocation(), FVector(0.f, 4600.f, 0.f)) < FMath::Square(1100.f);
}

void AVantageGameMode::NotifyLockOpened()
{
	if (bLockOpen)
	{
		return;
	}

	bLockOpen = true;

	// The cache only exists once the lock is off it, which saves having to make
	// it inert and then un-inert it.
	if (UWorld* World = GetWorld())
	{
		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		World->SpawnActor<AObjectiveCache>(ADesertBuilder::CacheLocation, FRotator::ZeroRotator, SpawnParams);
	}

	UE_LOG(LogVantage, Log, TEXT("Lock opened on wave %d."), Wave);
}

// ---------------------------------------------------------------------------
// waves
// ---------------------------------------------------------------------------

void AVantageGameMode::BeginIntermission()
{
	bBetweenWaves = true;

	GetWorldTimerManager().SetTimer(
		IntermissionTimer, this, &AVantageGameMode::OnIntermissionElapsed, IntermissionSeconds, false);
}

float AVantageGameMode::GetSecondsToNextWave() const
{
	if (!bBetweenWaves)
	{
		return 0.f;
	}
	return GetWorldTimerManager().GetTimerRemaining(IntermissionTimer);
}

void AVantageGameMode::OnIntermissionElapsed()
{
	bBetweenWaves = false;
	StartWave(Wave + 1);
}

void AVantageGameMode::StartWave(int32 WaveNumber)
{
	Wave = WaveNumber;

	// Grows steadily rather than sharply - the pressure should come from the
	// reload window, not from the count alone.
	const int32 Count = BaseWaveSize + (Wave - 1) * 2;

	for (int32 Index = 0; Index < Count; ++Index)
	{
		SpawnZombie(SpawnSalt++);
	}

	// A standing group around the vault, so the objective is defended rather
	// than merely distant. These are on top of the wave itself.
	const int32 Guards = 3 + Wave;
	SpawnVaultGuards(Guards, SpawnSalt);
	SpawnSalt += Guards;

	UE_LOG(LogVantage, Log, TEXT("Wave %d: %d shamblers, %d around the vault."), Wave, Count, Guards);

	// If nothing actually spawned, the "wave cleared" path never fires and the
	// run stalls with no zombies and no countdown. Fall back to another break.
	if (ZombiesAlive == 0)
	{
		UE_LOG(LogVantage, Error, TEXT("Wave %d spawned no zombies; retrying after a break."), Wave);
		BeginIntermission();
	}
}

void AVantageGameMode::SpawnVaultGuards(int32 Count, int32 Seed)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	for (int32 Index = 0; Index < Count; ++Index)
	{
		FRandomStream Stream(Seed * 7919 + Index * 613 + Wave * 29);

		// Scattered in front of the vault door, between it and the player.
		const FVector At(
			Stream.FRandRange(-900.f, 900.f),
			Stream.FRandRange(3500.f, 4150.f),
			120.f);

		AZombieCharacter* Zombie = World->SpawnActor<AZombieCharacter>(
			At, FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f), SpawnParams);

		if (Zombie)
		{
			Zombie->Randomise(Seed + Index * 31);
			++ZombiesAlive;
		}
	}
}

void AVantageGameMode::SpawnZombie(int32 Seed)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FRandomStream Stream(Seed * 7919 + Wave * 131);

	// Spawn on a ring well outside the player's field of interest, so they walk
	// in out of the haze rather than appearing in front of you.
	const float Angle = Stream.FRandRange(0.f, 360.f);
	const float Distance = Stream.FRandRange(1900.f, ADesertBuilder::ArenaRadius);

	const FVector At(
		FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
		FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
		120.f);

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	AZombieCharacter* Zombie = World->SpawnActor<AZombieCharacter>(
		At, FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f), SpawnParams);

	if (Zombie)
	{
		Zombie->Randomise(Seed);
		++ZombiesAlive;
	}
}

void AVantageGameMode::NotifyZombieKilled()
{
	++Kills;
	ZombiesAlive = FMath::Max(ZombiesAlive - 1, 0);

	if (ZombiesAlive == 0 && !bBetweenWaves && !bPlayerDown)
	{
		BeginIntermission();
	}
}

// ---------------------------------------------------------------------------
// death and restart
// ---------------------------------------------------------------------------

void AVantageGameMode::NotifyPlayerDown()
{
	if (bPlayerDown)
	{
		return;
	}

	bPlayerDown = true;
	GetWorldTimerManager().ClearTimer(IntermissionTimer);

	UE_LOG(LogVantage, Log, TEXT("Player down on wave %d with %d kills."), Wave, Kills);

	GetWorldTimerManager().SetTimer(RestartTimer, this, &AVantageGameMode::RestartRun, 4.f, false);
}

void AVantageGameMode::NotifyCacheTaken()
{
	if (Objective != EVantageObjective::FetchCache)
	{
		return;
	}

	Objective = EVantageObjective::ReturnToExtraction;
	UE_LOG(LogVantage, Log, TEXT("Cache taken on wave %d. Run it back."), Wave);
}

void AVantageGameMode::CheckExtraction()
{
	if (Objective != EVantageObjective::ReturnToExtraction || bPlayerDown)
	{
		return;
	}

	const UWorld* World = GetWorld();
	const APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	const AVantageCharacter* Player = PC ? Cast<AVantageCharacter>(PC->GetPawn()) : nullptr;
	if (!Player)
	{
		return;
	}

	const FVector Pad = ADesertBuilder::ExtractionLocation;
	if (FVector::DistSquared2D(Player->GetActorLocation(), Pad) > ExtractionRadius * ExtractionRadius)
	{
		return;
	}

	Objective = EVantageObjective::Complete;
	GetWorldTimerManager().ClearTimer(IntermissionTimer);

	UE_LOG(LogVantage, Log, TEXT("Extracted on wave %d with %d kills."), Wave, Kills);

	// Let the win sit for a moment, then set the whole thing up again.
	GetWorldTimerManager().SetTimer(RestartTimer, this, &AVantageGameMode::RestartRun, 8.f, false);
}

FText AVantageGameMode::GetObjectiveText() const
{
	switch (Objective)
	{
	case EVantageObjective::FetchCache:
		return bLockOpen
			? FText::FromString(TEXT("Take the cache"))
			: FText::FromString(TEXT("Climb the vault tower and work the lock"));

	case EVantageObjective::ReturnToExtraction:
		return FText::FromString(TEXT("Carry the cache back to the beacon"));

	default:
		return FText::FromString(TEXT("Extracted"));
	}
}

FVector AVantageGameMode::GetObjectiveLocation() const
{
	switch (Objective)
	{
	case EVantageObjective::FetchCache:
		if (bLockOpen)
		{
			return ADesertBuilder::CacheLocation + FVector(0.f, 0.f, 90.f);
		}
		// Point at the door until he is close enough for the lock upstairs to be
		// the useful thing to aim at.
		return IsPlayerNearVault()
			? ADesertBuilder::LockLocation + FVector(0.f, 0.f, 120.f)
			: ADesertBuilder::VaultDoorLocation + FVector(0.f, 0.f, 260.f);

	case EVantageObjective::ReturnToExtraction:
		return ADesertBuilder::ExtractionLocation + FVector(0.f, 0.f, 620.f);

	default:
		return ADesertBuilder::ExtractionLocation;
	}
}

void AVantageGameMode::RestartRun()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Clear the field. Iterating actors is fine here - it happens once per death,
	// not per frame.
	for (TActorIterator<AZombieCharacter> It(World); It; ++It)
	{
		It->Destroy();
	}

	ZombiesAlive = 0;
	Kills = 0;
	Wave = 0;
	bPlayerDown = false;

	// Put the cache back, whether the last run ended in a death or a win.
	for (TActorIterator<AObjectiveCache> It(World); It; ++It)
	{
		It->Destroy();
	}

	Objective = EVantageObjective::FetchCache;

	// New run, new combination, and the lock closes behind it.
	if (Lock)
	{
		Lock->Destroy();
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Lock = World->SpawnActor<ACodeLock>(ADesertBuilder::LockLocation, FRotator(0.f, 90.f, 0.f), SpawnParams);
	ArmLock();

	if (const APlayerController* PC = World->GetFirstPlayerController())
	{
		if (AVantageCharacter* Player = Cast<AVantageCharacter>(PC->GetPawn()))
		{
			Player->Revive(SpawnLocation);
		}
	}

	BeginIntermission();
}
