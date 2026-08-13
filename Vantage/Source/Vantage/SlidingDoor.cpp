#include "SlidingDoor.h"

#include "VantageGameMode.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	/** The engine cube is 100cm on a side, so half extents divide by 50. */
	constexpr float CubeHalfSize = 50.f;
}

ASlidingDoor::ASlidingDoor()
{
	PrimaryActorTick.bCanEverTick = true;

	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	RootComponent = Pivot;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));

	auto MakePanel = [&](const TCHAR* Name) -> UStaticMeshComponent*
	{
		UStaticMeshComponent* Panel = CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Panel->SetupAttachment(Pivot);
		if (CubeFinder.Succeeded())
		{
			Panel->SetStaticMesh(CubeFinder.Object);
		}
		Panel->SetCollisionProfileName(TEXT("BlockAll"));
		return Panel;
	};

	LeftPanel = MakePanel(TEXT("LeftPanel"));
	RightPanel = MakePanel(TEXT("RightPanel"));
}

void ASlidingDoor::BeginPlay()
{
	Super::BeginPlay();

	const FVector PanelScale(
		15.f / CubeHalfSize,
		PanelHalfWidth / CubeHalfSize,
		PanelHalfHeight / CubeHalfSize);

	LeftPanel->SetRelativeScale3D(PanelScale);
	RightPanel->SetRelativeScale3D(PanelScale);

	const FLinearColor PanelColor(0.26f, 0.28f, 0.33f);
	for (UStaticMeshComponent* Panel : { LeftPanel.Get(), RightPanel.Get() })
	{
		if (UMaterialInstanceDynamic* Material = Panel->CreateAndSetMaterialInstanceDynamic(0))
		{
			Material->SetVectorParameterValue(TEXT("Color"), PanelColor);
		}
	}

	ApplyPanelPositions();
}

void ASlidingDoor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!bOpening || OpenAlpha >= 1.f)
	{
		return;
	}

	OpenAlpha = FMath::Min(OpenAlpha + DeltaSeconds / FMath::Max(OpenSeconds, KINDA_SMALL_NUMBER), 1.f);
	ApplyPanelPositions();

	if (OpenAlpha >= 1.f && !bReportedOpen)
	{
		bReportedOpen = true;
		if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
		{
			GameMode->NotifyVaultOpened();
		}
		SetActorTickEnabled(false);
	}
}

void ASlidingDoor::ApplyPanelPositions()
{
	// Ease out, so the doors part fast and settle rather than stopping dead.
	const float Eased = 1.f - FMath::Pow(1.f - OpenAlpha, 3.f);
	const float Offset = PanelHalfWidth + OpenDistance * Eased;

	LeftPanel->SetRelativeLocation(FVector(0.f, -Offset, PanelHalfHeight));
	RightPanel->SetRelativeLocation(FVector(0.f, Offset, PanelHalfHeight));
}

FText ASlidingDoor::GetInteractionPrompt() const
{
	const AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>();
	if (!GameMode)
	{
		return FText::FromString(TEXT("Blast door"));
	}

	if (bOpening)
	{
		return FText::FromString(TEXT("Blast door unsealed"));
	}

	if (GameMode->GetShardsCollected() < GameMode->GetShardsRequired())
	{
		return FText::FromString(FString::Printf(
			TEXT("Sealed  -  %d of %d shards"),
			GameMode->GetShardsCollected(),
			GameMode->GetShardsRequired()));
	}

	return FText::FromString(TEXT("[E]  Unseal blast door"));
}

bool ASlidingDoor::CanInteract(const AVantageCharacter* Interactor) const
{
	if (bOpening)
	{
		return false;
	}

	const AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>();
	return GameMode && GameMode->GetShardsCollected() >= GameMode->GetShardsRequired();
}

void ASlidingDoor::Interact(AVantageCharacter* Interactor)
{
	bOpening = true;
}
